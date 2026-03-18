self.onmessage = function (e) {
	const { database, creditsDB, cart, config, ratings, mallaData } = e.data;
	const { creditsMax, apathy, busyBlocks } = config;

	// Convert time string to half-hour index (e.g., 08:00 = 16)
	const timeToSlot = (t) =>
		parseInt(t.split(':')[0]) * 2 + (t.includes(':30') ? 1 : 0);

	// Build the deterministic Search Space
	const availableCourses = Object.keys(cart).map((code) => {
		const conf = cart[code];
		const baseCredits = creditsDB[code] || 3;

		let validSections = Object.entries(database[code].sections);

		// --- PRUNING LAYER 1: Dead Sections ---
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
		// 1. FATAL CHECK: Personal Busy Blocks
		if (busyBlocks && busyBlocks.length > 0) {
			for (const block of busyBlocks) {
				const bStart = timeToSlot(block.start);
				const bEnd = timeToSlot(block.end);
				for (const slot of newSec.slots) {
					if (slot.day === block.day) {
						const overlapStart = Math.max(bStart, slot.start);
						const overlapEnd = Math.min(bEnd, slot.end);
						if (overlapStart < overlapEnd) {
							return { penalty: -1, overlaps: -1 }; // Death to this branch
						}
					}
				}
			}
		}

		// 2. STANDARD CHECK: Course Overlaps
		let penalty = 0;
		let overlapCount = 0;

		for (const existingSec of currentSchedule) {
			let triggeredOverlapForThisCourse = false;

			for (const slotA of existingSec.slots) {
				for (const slotB of newSec.slots) {
					if (slotA.day === slotB.day) {
						const start = Math.max(slotA.start, slotB.start);
						const end = Math.min(slotA.end, slotB.end);

						if (start < end) {
							if (slotA.type !== 'T' && slotB.type !== 'T') {
								return { penalty: -1, overlaps: -1 };
							}

							triggeredOverlapForThisCourse = true;
							const overlappedSlots = end - start;
							const basePenalty =
								slotA.type === 'T' && slotB.type === 'T' ? 20000 : 80000;
							penalty += basePenalty * overlappedSlots;
						}
					}
				}
			}
			if (triggeredOverlapForThisCourse) overlapCount++;
		}

		return { penalty: penalty * (1 - apathy), overlaps: overlapCount };
	}

	function calculateMaxGap(schedule) {
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
		return maxGap / 2;
	}

	// --- RECURSIVE BACKTRACKING ENGINE ---
	function solve(
		idx,
		currentSchedule,
		currentCredits,
		currentScore,
		currentOverlaps,
	) {
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

				bestSchedules.sort((a, b) => b.score - a.score);
				if (bestSchedules.length > MAX_RESULTS) bestSchedules.pop();
			}
			return;
		}

		const course = availableCourses[idx];

		for (const sec of course.sections) {
			if (currentCredits + sec.credits <= creditsMax) {
				const { penalty, overlaps } = checkConflict(sec, currentSchedule);

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

	solve(0, [], 0, 0, 0);
	self.postMessage({ results: bestSchedules });
};
