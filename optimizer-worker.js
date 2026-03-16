self.onmessage = function (e) {
	const { database, creditsDB, cart, config, ratings } = e.data;
	const { creditsMax, apathy } = config;

	// Convert time string to half-hour index (e.g., 08:00 = 16)
	const timeToSlot = (t) =>
		parseInt(t.split(':')[0]) * 2 + (t.includes(':30') ? 1 : 0);

	// Build the deterministic Search Space
	const availableCourses = Object.keys(cart).map((code) => {
		const conf = cart[code];
		const baseCredits = creditsDB[code] || 3;

		let validSections = Object.entries(database[code].sections);

		// --- PRUNING LAYER 1: Dead Sections ---
		// Completely eradicate sections the user marked as full
		if (conf.deadSections && conf.deadSections.length > 0) {
			validSections = validSections.filter(
				([id]) => !conf.deadSections.includes(id),
			);
		}

		// --- PRUNING LAYER 2: Locked Sections ---
		if (conf.lockedSection) {
			validSections = validSections.filter(([id]) => id === conf.lockedSection);
		}

		return {
			code,
			obligatory: conf.obligatory,
			weight: conf.importance,
			credits: baseCredits,
			sections: validSections.map(([id, sessions]) => {
				let totalRating = 0;
				let ratedCount = 0;

				const processedSlots = sessions.map((s) => {
					// Extract granular rating per session type
					let tRating = 0.5;
					if (
						ratings[code] &&
						ratings[code][s.type] &&
						ratings[code][s.type][s.teacher]
					) {
						tRating = ratings[code][s.type][s.teacher].rating;
					}
					totalRating += tRating;
					ratedCount++;

					return {
						day: s.day,
						start: timeToSlot(s.start),
						end: timeToSlot(s.end),
						type: s.type,
						teacher: s.teacher,
					};
				});

				const sectionAvgRating =
					ratedCount > 0 ? totalRating / ratedCount : 0.5;

				return {
					id,
					courseCode: code,
					credits: baseCredits,
					slots: processedSlots,
					rating: sectionAvgRating,
				};
			}),
		};
	});

	let bestSchedules = [];
	const MAX_RESULTS = 50;

	// --- STATELESS VALIDATOR ---
	function checkConflict(newSec, currentSchedule) {
		let penalty = 0;
		let overlapCount = 0;

		for (const existingSec of currentSchedule) {
			let triggeredOverlapForThisCourse = false;

			for (const slotA of existingSec.slots) {
				for (const slotB of newSec.slots) {
					if (slotA.day === slotB.day) {
						// Math: Intervals [a, b) and [c, d) overlap if max(a,c) < min(b,d)
						const start = Math.max(slotA.start, slotB.start);
						const end = Math.min(slotA.end, slotB.end);

						if (start < end) {
							// P-P (Practice/Exam vs Practice/Exam) Overlap -> Fatal Error
							if (slotA.type !== 'T' && slotB.type !== 'T') {
								return { penalty: -1, overlaps: -1 };
							}

							triggeredOverlapForThisCourse = true;
							const overlappedSlots = end - start;

							// Base penalties are massive to ensure sorting works natively
							const basePenalty =
								slotA.type === 'T' && slotB.type === 'T' ? 20000 : 80000;
							penalty += basePenalty * overlappedSlots;
						}
					}
				}
			}
			if (triggeredOverlapForThisCourse) overlapCount++;
		}

		// Apathy reduction: If apathy is 1 (Ghost mode), penalty becomes 0.
		return { penalty: penalty * (1 - apathy), overlaps: overlapCount };
	}

	function calculateMaxGap(schedule) {
		// Build an isolated boolean array just for gap counting
		let days = Array.from({ length: 7 }, () => new Array(48).fill(false));
		schedule.forEach((sec) => {
			sec.slots.forEach((slot) => {
				for (let i = slot.start; i < slot.end; i++)
					days[slot.day - 1][i] = true;
			});
		});

		let maxGap = 0;
		for (let d = 0; d < 7; d++) {
			let currGap = 0,
				inGap = false,
				dayStarted = false;
			for (let i = 0; i < 48; i++) {
				if (days[d][i]) {
					dayStarted = true;
					if (inGap) {
						if (currGap > maxGap) maxGap = currGap;
						inGap = false;
						currGap = 0;
					}
				} else if (dayStarted) {
					inGap = true;
					currGap++;
				}
			}
		}
		return maxGap / 2; // Return in Hours
	}

	// --- RECURSIVE BACKTRACKING ENGINE ---
	function solve(
		idx,
		currentSchedule,
		currentCredits,
		currentScore,
		currentOverlaps,
	) {
		// Base Case: Reached the end of the course list
		if (idx === availableCourses.length) {
			const hasAllObligatory = availableCourses
				.filter((c) => c.obligatory)
				.every((c) => currentSchedule.some((s) => s.courseCode === c.code));

			if (hasAllObligatory) {
				bestSchedules.push({
					schedule: [...currentSchedule],
					score: currentScore,
					credits: currentCredits,
					overlaps: currentOverlaps,
					maxGap: calculateMaxGap(currentSchedule),
				});

				// Sort descending by score, prune array to top 50 to save memory
				bestSchedules.sort((a, b) => b.score - a.score);
				if (bestSchedules.length > MAX_RESULTS) bestSchedules.pop();
			}
			return;
		}

		const course = availableCourses[idx];

		// Branch 1: Try adding the course
		for (const sec of course.sections) {
			if (currentCredits + sec.credits <= creditsMax) {
				const { penalty, overlaps } = checkConflict(sec, currentSchedule);

				// Proceed only if it's not a Fatal P-P overlap
				if (penalty !== -1) {
					const importanceBoost = course.weight * 5000;
					const newScore = currentScore + importanceBoost - penalty;

					solve(
						idx + 1,
						[...currentSchedule, sec],
						currentCredits + sec.credits,
						newScore,
						currentOverlaps + overlaps,
					);
				}
			}
		}

		// Branch 2: Don't take the course (Only valid if it's not obligatory)
		if (!course.obligatory) {
			solve(
				idx + 1,
				currentSchedule,
				currentCredits,
				currentScore,
				currentOverlaps,
			);
		}
	}

	// Initialize with 0 state
	solve(0, [], 0, 0, 0);

	// Transmit payload back to main UI thread
	self.postMessage({ results: bestSchedules });
};
