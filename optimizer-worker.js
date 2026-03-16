self.onmessage = function(e) {
    const { database, malla, ratings, config } = e.data;
    const { creditsMax, obligatory, desired, apathy, gapPref } = config;

    const timeToSlot = (t) => parseInt(t.split(':')[0]) * 2 + (t.includes(':30') ? 1 : 0);

    const availableCourses = [...obligatory, ...desired].map(code => {
        if(!database[code]) return null;
        return {
            code,
            weight: malla[code]?.weight || 5,
            credits: malla[code]?.credits || 3,
            sections: Object.entries(database[code].sections).map(([id, sessions]) => ({
                id,
                courseCode: code,
                credits: malla[code]?.credits || 3,
                slots: sessions.map(s => ({
                    day: s.day,
                    start: timeToSlot(s.start),
                    end: timeToSlot(s.end),
                    type: s.type
                })),
                rating: ratings[sessions[0].teacher]?.rating || 0.5,
                vacantes: sessions[0].vacantes
            }))
        };
    }).filter(c => c !== null);

    let bestSchedules = [];
    const MAX_RESULTS = 50;
    const matrix = new Uint8Array(7 * 48);

    function checkConflict(section) {
        let penalty = 0;
        for (const slot of section.slots) {
            for (let i = slot.start; i < slot.end; i++) {
                const idx = (slot.day - 1) * 48 + i;
                const existing = matrix[idx];
                if (existing > 0) {
                    if (existing === 2 && slot.type !== 'T') return -1; // P-P = FATAL
                    penalty += (slot.type === 'T' && existing === 1) ? 500 : 5000;
                }
            }
        }
        return penalty * (1 - apathy);
    }

    function toggleMatrix(section, state) {
        const val = (section.slots[0].type === 'T') ? 1 : 2;
        for (const slot of section.slots) {
            for (let i = slot.start; i < slot.end; i++) {
                matrix[(slot.day - 1) * 48 + i] = state ? val : 0;
            }
        }
    }

    function solve(idx, currentSchedule, currentCredits, currentScore) {
        if (idx === availableCourses.length) {
            bestSchedules.push({ schedule: [...currentSchedule], score: currentScore, credits: currentCredits });
            bestSchedules.sort((a, b) => b.score - a.score);
            if (bestSchedules.length > MAX_RESULTS) bestSchedules.pop();
            return;
        }

        const course = availableCourses[idx];
        let sectionAdded = false;

        for (const sec of course.sections) {
            if (currentCredits + sec.credits <= creditsMax) {
                const penalty = checkConflict(sec);
                if (penalty !== -1) {
                    toggleMatrix(sec, true);
                    solve(idx + 1, [...currentSchedule, sec], currentCredits + sec.credits, currentScore + (sec.rating * course.weight * 10) - penalty);
                    toggleMatrix(sec, false);
                    sectionAdded = true;
                }
            }
        }

        if (!obligatory.includes(course.code)) {
            solve(idx + 1, currentSchedule, currentCredits, currentScore - (course.weight * 100));
        }
    }

    solve(0, [], 0, 100000);
    self.postMessage({ results: bestSchedules });
};