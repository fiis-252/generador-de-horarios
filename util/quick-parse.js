const fs = require('fs');

// Read the raw TSV file
const tsvData = fs.readFileSync('carga.tsv', 'utf-8');
const lines = tsvData
	.split('\n')
	.map((l) => l.trim())
	.filter((l) => l);

const db = {};

const dayMap = {
	LU: 1,
	MA: 2,
	MI: 3,
	JU: 4,
	VI: 5,
	SA: 6,
	DO: 7,
};

// Skip the header row
for (let i = 1; i < lines.length; i++) {
	const parts = lines[i].split('\t').map((p) => p.trim());

	if (parts.length < 11) continue;

	const code = parts[0];
	const name = parts[1];
	const section = parts[2];
	let teacher = parts[4];
	let type = parts[5];
	const room = parts[6];
	const dayRaw = parts[7];
	const startRaw = parts[8];
	const endRaw = parts[9];
	const dni = parts[10];
	const vacantesRaw = parts[11];

	// --- CORRUPTION HEALING LOGIC ---
	if (dni && dni.includes('Solo para PC')) {
		if (!teacher) teacher = 'NN (Solo para PC)';
		if (!type) type = 'LAB'; // Fallback for the missing FB101 types
	}
	if (!teacher) teacher = 'NN';
	if (!type) type = 'TBD';

	const day = dayMap[dayRaw] || 1;
	const start = startRaw.padStart(2, '0') + ':00:00';
	const end = endRaw.padStart(2, '0') + ':00:00';
	const vacantes = parseInt(vacantesRaw, 10) || 0;

	// Build JSON tree
	if (!db[code]) {
		db[code] = { name: name, sections: {} };
	}
	if (!db[code].sections[section]) {
		db[code].sections[section] = [];
	}

	db[code].sections[section].push({
		type: type,
		day: day,
		start: start,
		end: end,
		teacher: teacher,
		room: room,
		vacantes: vacantes, // Injected new data node
	});
}

fs.writeFileSync('database.json', JSON.stringify(db, null, 2));
console.log('✅ database.json compiled successfully. Corruptions healed.');
