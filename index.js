const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

let use24Hour = localStorage.getItem('hourFormat') === '24h';

function handleThemeSwitch(checkbox) {
	const target = checkbox.checked ? 'dark' : 'light';
	document.documentElement.setAttribute('data-theme', target);
	localStorage.setItem('theme', target);
}

window.addEventListener('DOMContentLoaded', () => {
	const themeBox = document.getElementById('themeToggle');
	if (themeBox) themeBox.checked = savedTheme === 'dark';

	const hourBox = document.getElementById('hourToggle');
	if (hourBox) hourBox.checked = use24Hour;
});

let notificationTimeout;

function showNotification(message, type) {
	const notif = document.getElementById('notification');

	notif.innerText = message;

	notif.className = `notification show ${type === 'success' ? 'success-bg' : 'error-bg'}`;

	clearTimeout(notificationTimeout);
	notificationTimeout = setTimeout(() => {
		notif.classList.remove('show');
	}, 3000);
}

function handleHourSwitch(checkbox) {
	use24Hour = checkbox.checked;
	localStorage.setItem('hourFormat', use24Hour ? '24h' : '12h');

	if (fcCalendar) {
		fcCalendar.setOption('slotLabelFormat', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: !use24Hour,
		});
		fcCalendar.setOption('eventTimeFormat', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: !use24Hour,
		});
	}
}

let courseDatabase = {};
const FC_COLORS = [
	'#1E90FF',
	'#28A745',
	'#FF8C00',
	'#6F42C1',
	'#DC3545',
	'#20C997',
	'#E83E8C',
];
const COLOR_NAMES = {
	'#1E90FF': 'Azul',
	'#28A745': 'Verde',
	'#FF8C00': 'Naranja',
	'#6F42C1': 'Morado',
	'#DC3545': 'Rojo',
	'#20C997': 'Turquesa',
	'#E83E8C': 'Rosa',
};
let selectedSections = [];
let editingEventId = null;
let currentCourseCode = null;
let sessionMap = {};
let pointerMatrix = [];

function buildPointerMatrix(db) {
	let rawList = [];
	Object.keys(db).forEach((courseCode) => {
		Object.keys(db[courseCode].sections).forEach((sec) => {
			rawList.push(`${courseCode}_${sec}`);
		});
	});

	pointerMatrix = rawList.sort();
}

const BASE62_CHARSET =
	'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function toBase62(num) {
	if (num === 0n) return '0';
	let str = '';
	while (num > 0n) {
		str = BASE62_CHARSET[Number(num % 62n)] + str;
		num /= 62n;
	}
	return str;
}

function fromBase62(str) {
	let num = 0n;
	for (let i = 0; i < str.length; i++) {
		num = num * 62n + BigInt(BASE62_CHARSET.indexOf(str[i]));
	}
	return num;
}

const BITS_PER_CLASS = 13n;
const MASK_13_BIT = (1n << BITS_PER_CLASS) - 1n; // 0x1FFF
const COLOR_MASK = 15n; // 0x0F (4 bits)

function encodeSchedule(scheduleArray) {
	let payload = 0n;

	scheduleArray.forEach((item, i) => {
		const classKey = `${item.code}_${item.section}`;
		let classId = pointerMatrix.indexOf(classKey);

		if (classId === -1) return; // Failsafe para cursos fantasma

		const colorId = item.colorIndex || 0; // 0 a 15

		// Empaquetar: [ClassId: 9 bits] [ColorId: 4 bits]
		const packedBlock = (BigInt(classId) << 4n) | BigInt(colorId);

		// Desplazar el bloque a su posicion en la carga util principal y fusionar (OR)
		payload |= packedBlock << (BigInt(i) * BITS_PER_CLASS);
	});

	return toBase62(payload);
}

function decodeSchedule(base62Str) {
	let payload = fromBase62(base62Str);
	const decoded = [];

	while (payload > 0n) {
		// Extraer los primeros 13 bits usando la mascara (AND)
		const block = payload & MASK_13_BIT;

		// Desempaquetar
		const colorId = Number(block & COLOR_MASK);
		const classId = Number(block >> 4n);

		const classKey = pointerMatrix[classId];
		if (classKey) {
			const [code, section] = classKey.split('_');
			decoded.push({ code, section, colorIndex: colorId });
		}

		// Mover la carga util 13 bits a la derecha para leer el siguiente bloque
		payload >>= BITS_PER_CLASS;
	}

	return decoded;
}

function toggleColorDropdown(event) {
	event.stopPropagation();
	document.getElementById('customColorSelect').classList.toggle('open');
}

function selectColor(hex, name) {
	const select = document.getElementById('customColorSelect');
	select.setAttribute('data-value', hex);
	document.getElementById('triggerDot').style.backgroundColor = hex;
	document.getElementById('triggerText').innerText = name;
	select.classList.remove('open');
}

window.addEventListener('click', function (e) {
	// cerrar el modal si haces click fuera de aquel
	const select = document.getElementById('customColorSelect');
	if (select && !select.contains(e.target)) {
		select.classList.remove('open');
	}
});

async function initializeApp() {
	try {
		const response = await fetch('./database.json');
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
		courseDatabase = await response.json();

		let masterIdCounter = 0;
		Object.keys(courseDatabase).forEach((code) => {
			Object.keys(courseDatabase[code].sections).forEach((sec) => {
				courseDatabase[code].sections[sec].forEach((sess) => {
					sess.id = masterIdCounter++;
					sessionMap[sess.id] = {
						code: code,
						name: courseDatabase[code].name,
						section: sec,
						baseSession: sess,
					};
				});
			});
		});

		// Compilar la matriz determinista en memoria ANTES de leer/escribir el link
		buildPointerMatrix(courseDatabase);

		loadStateFromURL();
	} catch (error) {
		console.error('Failed to load course database:', error);
		document.getElementById('results').innerHTML =
			`<span style="color:red">Error: No se pudo cargar database.json. ¿Estás usando un servidor local?</span>`;
	}
}

function searchCourses() {
	const rawQ = document.getElementById('searchBox').value.toUpperCase();
	const normalizedQ = rawQ.replace(/-/g, '');
	const resDiv = document.getElementById('results');
	resDiv.innerHTML = '';
	if (!normalizedQ) return;
	Object.keys(courseDatabase).forEach((code) => {
		const course = courseDatabase[code];
		const normalizedCode = code.replace(/-/g, '');

		if (normalizedCode.includes(normalizedQ) || course.name.includes(rawQ)) {
			const btn = document.createElement('button');
			btn.className = 'course-btn';
			btn.innerText = `${code} - ${course.name}`;
			btn.onclick = () => openSectionModal(code);
			resDiv.appendChild(btn);
		}
	});
	if (resDiv.innerHTML === '') resDiv.innerHTML = 'No se encontraron cursos.';
	else {
		document.getElementById('results').style.marginTop = '15px';
	}
}
function openSectionModal(code) {
	currentCourseCode = code;
	const course = courseDatabase[code];
	document.getElementById('popupTitle').innerText = `${code} - ${course.name}`;
	const list = document.getElementById('sectionsList');
	list.innerHTML = '';

	const dayNames = [
		'',
		'Lunes',
		'Martes',
		'Miércoles',
		'Jueves',
		'Viernes',
		'Sábado',
		'Domingo',
	];
	Object.keys(course.sections).forEach((secName) => {
		const sessions = course.sections[secName];

		const isEnrolled = selectedSections.some(
			(s) => s.code === code && s.section === secName,
		);
		const checkedAttr = isEnrolled ? 'checked' : '';
		const div = document.createElement('div');
		div.className = 'section-block';

		div.innerHTML = `<label style="font-weight: bold; cursor: pointer; display: block; margin-bottom: 8px;">
            <input type="radio" name="section-select" value="${secName}" ${checkedAttr}> Sección ${secName}
        </label>`;

		let tableHTML = `<table class="section-table">
            <thead>
                <tr>
                    <th>Tipo</th>
                    <th>Día</th>
                    <th>Horas</th>
                    <th>Profesor</th>
                </tr>
            </thead>
            <tbody>`;
		sessions.forEach((sess) => {
			tableHTML += `<tr>
                <td>${sess.type}</td>
                <td>${dayNames[sess.day]}</td>
                <td style="white-space: nowrap;">${sess.start.slice(0, 5)} - ${sess.end.slice(0, 5)}</td>
                <td>${sess.teacher}</td>
            </tr>`;
		});
		tableHTML += `</tbody></table>`;
		div.innerHTML += tableHTML;
		list.appendChild(div);
	});
	document.getElementById('overlay').style.display = 'block';
	document.getElementById('popup').style.display = 'block';
}
function addSelectedSections() {
	const selectedRadio = document.querySelector(
		'input[name="section-select"]:checked',
	);

	if (!selectedRadio) {
		closePopups();
		return;
	}
	const secName = selectedRadio.value;
	const course = courseDatabase[currentCourseCode];

	selectedSections = selectedSections.filter(
		(s) => s.code !== currentCourseCode,
	);

	const sessionsCopy = JSON.parse(JSON.stringify(course.sections[secName]));
	selectedSections.push({
		code: currentCourseCode,
		name: course.name,
		section: secName,
		sessions: sessionsCopy,
	});
	closePopups();
	refreshCalendar();
	saveStateToURL();
}

function openHelpModal() {
	document.getElementById('overlay').style.display = 'block';
	document.getElementById('helpPopup').style.display = 'block';
}

function closePopups() {
	document.getElementById('overlay').style.display = 'none';
	document.getElementById('popup').style.display = 'none';
	document.getElementById('editPopup').style.display = 'none';
	document.getElementById('helpPopup').style.display = 'none';
	document.getElementById('optOverlay').style.display = 'none';
	document.getElementById('optimizerModal').style.display = 'none';
	document.getElementById('teacherModal').style.display = 'none';

	const customSelect = document.getElementById('customColorSelect');
	if (customSelect) customSelect.classList.remove('open');

	editingEventId = null;
}

function saveStateToURL() {
	// 1. mapear el estado actual de la ui al formato del empaquetador de bits
	const schedulePayload = selectedSections.map((sec, i) => {
		// tomamos el color de la primera sesion (toda la seccion comparte el mismo color)
		let assignedColor =
			sec.sessions[0]?.color || FC_COLORS[i % FC_COLORS.length];
		let colorIdx = FC_COLORS.indexOf(assignedColor);

		// failsafe por si el color se corrompe o no existe en la paleta xd
		if (colorIdx === -1) colorIdx = i % FC_COLORS.length;

		return {
			code: sec.code,
			section: sec.section,
			colorIndex: colorIdx,
		};
	});

	// 2. Ejecutar compresion
	const compressedPayload = encodeSchedule(schedulePayload);

	// 3. Actualizar el url usando ?c=
	const newUrl =
		window.location.protocol +
		'//' +
		window.location.host +
		window.location.pathname +
		'?c=' +
		compressedPayload;

	window.history.replaceState({ path: newUrl }, '', newUrl);
	renderLegend();
}

function loadStateFromURL() {
	const urlParams = new URLSearchParams(window.location.search);
	selectedSections = [];
	const sectionsBuffer = {};

	// --- Descompresion en base62 (con punteros 13bit) ---
	if (urlParams.has('c')) {
		const payload = urlParams.get('c');
		const decodedClasses = decodeSchedule(payload);

		decodedClasses.forEach((item) => {
			const { code, section, colorIndex } = item;

			const course = courseDatabase[code];
			if (!course || !course.sections || !course.sections[section]) return;

			const secKey = `${code}-${section}`;
			// Usar la paleta de colores de la interfaz, fallback al indice 0
			const color = FC_COLORS[colorIndex] || FC_COLORS[0];

			if (!sectionsBuffer[secKey]) {
				sectionsBuffer[secKey] = {
					code: code,
					name: course.name,
					section: section,
					sessions: [],
				};
			}

			// Expandir el puntero: Agregar todas las sesiones de esta seccion
			course.sections[section].forEach((sessionData, index) => {
				sectionsBuffer[secKey].sessions.push({
					...sessionData,
					// Reconstruir un ID pseudo-unico si tu calendario lo requiere para eventos
					id: `${code}-${section}-${index}`,
					color: color,
				});
			});
		});

		// --- Descompresion de 6-Chars ---
	} else if (urlParams.has('s')) {
		const state = urlParams.get('s');
		for (let i = 0; i < state.length; i += 6) {
			const block = state.slice(i, i + 6);
			if (block.length < 6) continue;
			const id = parseInt(block.slice(0, 2), 36);
			const day = parseInt(block[2], 10);
			const start =
				parseInt(block[3], 36).toString().padStart(2, '0') + ':00:00';
			const end = parseInt(block[4], 36).toString().padStart(2, '0') + ':00:00';
			const color = FC_COLORS[parseInt(block[5], 10)];

			const pointerData = sessionMap[id];
			if (!pointerData) continue;

			const secKey = `${pointerData.code}-${pointerData.section}`;
			if (!sectionsBuffer[secKey]) {
				sectionsBuffer[secKey] = {
					code: pointerData.code,
					name: pointerData.name,
					section: pointerData.section,
					sessions: [],
				};
			}

			sectionsBuffer[secKey].sessions.push({
				...pointerData.baseSession,
				id: id,
				day: day,
				start: start,
				end: end,
				color: color,
			});
		}
	} else {
		refreshCalendar();
		return;
	}

	// --- renderizado final ---
	selectedSections = Object.values(sectionsBuffer);
	refreshCalendar();
	renderLegend();
}

function copySyncUrl() {
	saveStateToURL();
	navigator.clipboard.writeText(window.location.href);
	showNotification(
		'Enlace copiado, compártelo con otros o abrelo en otro dispositivo',
		'success',
	);
}

let fcCalendar = null;
function getMonday() {
	const d = new Date();
	const day = (d.getDay() + 6) % 7;
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() - day);
	return d;
}
function refreshCalendar() {
	if (!fcCalendar) {
		const el = document.getElementById('calendar');
		fcCalendar = new FullCalendar.Calendar(el, {
			initialView: 'timeGridWeek',
			firstDay: 1,
			locale: 'es',
			dayHeaderFormat: { weekday: 'long' },
			allDaySlot: false,
			slotMinTime: '07:00:00',
			slotMaxTime: '23:00:00',
			height: 'auto',
			slotDuration: '01:00:00',
			headerToolbar: false,
			editable: true,
			slotEventOverlap: false,
			slotLabelFormat: {
				hour: 'numeric',
				minute: '2-digit',
				hour12: !use24Hour,
			},
			eventTimeFormat: {
				hour: 'numeric',
				minute: '2-digit',
				hour12: !use24Hour,
			},
			eventContent: function (arg) {
				const titleParts = arg.event.title.split(' - ');
				const courseCode = titleParts[0] || '';
				const courseType = titleParts[1] || '';
				// const courseRoom = titleParts[1] || '';
				return {
					html: `
                  <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; width: 100%; text-align: center; padding: 2px; box-sizing: border-box;">
                      <div style="font-size: 0.75em; opacity: 0.9; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 4px;">
                        ${arg.timeText}
                      </div>
                      <div style="font-size: 1.05em; font-weight: 800; text-shadow: 0px 1px 2px rgba(0,0,0,0.3); line-height: 1.1;">
                        ${courseCode} - ${arg.event._def.extendedProps.section}
                      </div>
                      <div style="font-size: 0.7em; margin-top: 4px; font-weight: 600; text-transform: uppercase; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.2);">
                        ${courseType}
                      </div>
                  </div>
                `,
				};
			},
			eventDrop: function (info) {
				const evt = info.event;
				const [secIndex, sessIndex] = evt.id.split('-');
				const newDay = evt.start.getDay() === 0 ? 7 : evt.start.getDay();
				const toTimeStr = (date) => date.toTimeString().split(' ')[0];
				selectedSections[secIndex].sessions[sessIndex].day = newDay;
				selectedSections[secIndex].sessions[sessIndex].start = toTimeStr(
					evt.start,
				);
				selectedSections[secIndex].sessions[sessIndex].end = toTimeStr(evt.end);
				saveStateToURL();
			},
			eventClick: function (info) {
				editingEventId = info.event.id;

				let color = info.event.backgroundColor;
				if (FC_COLORS.indexOf(color) === -1) color = FC_COLORS[0];

				// Bind data to our custom component instead of a native input
				const customSelect = document.getElementById('customColorSelect');
				customSelect.setAttribute('data-value', color);
				document.getElementById('triggerDot').style.backgroundColor = color;
				document.getElementById('triggerText').innerText =
					COLOR_NAMES[color] || 'Color';

				document.getElementById('overlay').style.display = 'block';
				document.getElementById('editPopup').style.display = 'block';
			},
		});
		fcCalendar.render();
	}
	fcCalendar.removeAllEvents();
	const events = [];
	const monday = getMonday();
	selectedSections.forEach((sec, i) => {
		const defaultColor = FC_COLORS[i % FC_COLORS.length];
		sec.sessions.forEach((sess, j) => {
			const dStart = new Date(monday);
			dStart.setDate(monday.getDate() + (sess.day - 1));
			const [sh, sm] = sess.start.split(':');
			dStart.setHours(sh, sm, 0);
			const dEnd = new Date(monday);
			dEnd.setDate(monday.getDate() + (sess.day - 1));
			const [eh, em] = sess.end.split(':');
			dEnd.setHours(eh, em, 0);

			let displayColor = sess.color || defaultColor;
			if (!sess.color && sess.type === 'Práctica Calificada')
				displayColor = '#dc3545';
			events.push({
				id: `${i}-${j}`,
				title: sess.customName || `${sec.code} - ${sess.type}`,
				start: dStart.toISOString(),
				end: dEnd.toISOString(),
				section: sec.section,
				backgroundColor: displayColor,
				borderColor: displayColor,
			});
		});
	});
	fcCalendar.addEventSource(events);
}

function saveEdit() {
	if (!editingEventId) return;
	const [secIndex, sessIndex] = editingEventId.split('-');
	//xd
	const selectedColor = document
		.getElementById('customColorSelect')
		.getAttribute('data-value');

	selectedSections[secIndex].sessions.forEach((sess) => {
		sess.color = selectedColor;
	});

	closePopups();
	refreshCalendar();
	saveStateToURL();
}

function deleteEvent() {
	if (!editingEventId) return;
	const [secIndex, sessIndex] = editingEventId.split('-');
	selectedSections[secIndex].sessions.splice(sessIndex, 1);
	if (selectedSections[secIndex].sessions.length === 0) {
		selectedSections.splice(secIndex, 1);
	}
	closePopups();
	refreshCalendar();
	saveStateToURL();
}

function renderLegend() {
	const legendDiv = document.getElementById('legend');
	legendDiv.innerHTML =
		'<h3 style="margin-top:0; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Cursos en Horario</h3>';

	if (selectedSections.length === 0) {
		legendDiv.innerHTML +=
			'<p style="color: #888;">No hay cursos seleccionados.</p>';
		return;
	}

	selectedSections.forEach((sec, i) => {
		const color = sec.sessions[0]?.color || FC_COLORS[i % FC_COLORS.length];
		const prof = sec.sessions[0]?.teacher || 'Varios';
		// Extract vacantes from the state pointer
		const vacantes = sec.sessions[0]?.vacantes || '-';

		const item = document.createElement('div');
		item.style.display = 'flex';
		item.style.justifyContent = 'space-between';
		item.style.alignItems = 'center';
		item.style.padding = '10px 0';
		item.style.borderBottom = '1px solid var(--border-color)';

		item.innerHTML = `
            <div style="display: flex; align-items: center; font-size: 0.95em;">
                <div style="width: 14px; height: 14px; border-radius: 4px; background-color: ${color}; margin-right: 12px; flex-shrink: 0;"></div>
                <div>
                    <strong>${sec.code} - ${sec.name} (${sec.section})</strong><br>
                    <div style="display: flex; align-items: center; gap: 10px; margin-top: 4px;">
                      <span style="color: #666; font-size: 0.85em;">${prof}</span>
                      <span style="font-size: 0.75em; font-weight: 700; background: var(--bg-color); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 4px; color: var(--btn-bg);">
                        VACANTES: ${vacantes}
                      </span>
                    </div>
                </div>
            </div>
            <button class="danger" style="padding: 6px 12px; font-size: 0.85em; margin: 0;" onclick="removeCourse('${sec.code}')">Eliminar</button>
        `;
		legendDiv.appendChild(item);
	});
}

function removeCourse(courseCode) {
	selectedSections = selectedSections.filter((s) => s.code !== courseCode);

	saveStateToURL();
	refreshCalendar();
}
function downloadICS() {
	if (selectedSections.length === 0) {
		showNotification('El horario está vacío.', 'error');
		return;
	}
	let icsMSG = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//xd//ES\n';
	const monday = getMonday();
	const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
	selectedSections.forEach((sec) => {
		sec.sessions.forEach((sess) => {
			const dStart = new Date(monday);
			dStart.setDate(monday.getDate() + (sess.day - 1));
			const [sh, sm] = sess.start.split(':');
			dStart.setHours(sh, sm, 0);
			const dEnd = new Date(monday);
			dEnd.setDate(monday.getDate() + (sess.day - 1));
			const [eh, em] = sess.end.split(':');
			dEnd.setHours(eh, em, 0);
			icsMSG += 'BEGIN:VEVENT\n';
			icsMSG += `SUMMARY:${sess.customName || sec.code + ' ' + sess.type}\n`;
			icsMSG += `DESCRIPTION:${sec.name}\\nProfesor: ${sess.teacher}\\nSección: ${sec.section}\n`;
			icsMSG += `DTSTART:${fmt(dStart)}\n`;
			icsMSG += `DTEND:${fmt(dEnd)}\n`;
			icsMSG += `RRULE:FREQ=WEEKLY;UNTIL=20260701T000000Z\n`;
			icsMSG += 'END:VEVENT\n';
		});
	});
	icsMSG += 'END:VCALENDAR';
	const blob = new Blob([icsMSG], {
		type: 'text/calendar;charset=utf-8',
	});
	const link = document.createElement('a');
	link.href = window.URL.createObjectURL(blob);
	link.download = 'Mi_Horario_UNI.ics';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

initializeApp();

// --- optimizacion ---
let optWorker;
let optCreditsDB = null;
let mallaData = null;
let optCartData = {}; // Stores { obligatory: bool, importance: int, lockedSection: string }

async function openOptimizerModal() {
	// cargar el diccionario de creditos
	if (!optCreditsDB) {
		try {
			optCreditsDB = await fetch('./credits.json').then((r) => r.json());
		} catch (e) {
			console.error('Missing credits.json');
			optCreditsDB = {};
		}
	}

	// cargar el grafo de mallas
	if (!mallaData) {
		try {
			mallaData = await fetch('./mallas.json').then((r) => r.json());
		} catch (e) {
			console.error('Missing mallas.json');
			mallaData = {};
		}
	}

	loadOptState(); // restaurar memoria de localStorage

	document.getElementById('optOverlay').style.display = 'block';
	document.getElementById('optimizerModal').style.display = 'block';
	updateOptCartUI();
}

function searchOptCourses() {
	const q = document
		.getElementById('optSearchInput')
		.value.toUpperCase()
		.replace(/-/g, '');
	const resDiv = document.getElementById('optSearchResults');
	resDiv.innerHTML = '';
	if (!q) return;

	Object.keys(courseDatabase).forEach((code) => {
		if (
			code.replace(/-/g, '').includes(q) ||
			courseDatabase[code].name.includes(q)
		) {
			const btn = document.createElement('button');
			btn.className = 'course-btn';
			btn.innerText = `${code} - ${courseDatabase[code].name} (${optCreditsDB[code] || 3} cred)`;
			btn.onclick = () => addCourseToOpt(code);
			resDiv.appendChild(btn);
		}
	});
}

function addCourseToOpt(code) {
	if (!optCartData[code]) {
		// Inicializamos el array de deadSections
		optCartData[code] = {
			obligatory: false,
			importance: 5,
			lockedSection: '',
			deadSections: [],
		};
		updateOptCartUI();
	}
	document.getElementById('optSearchInput').value = '';
	document.getElementById('optSearchResults').innerHTML = '';
}

function toggleDeadSection(code, sec, element) {
	const isDead = element.checked;

	if (isDead) {
		if (!optCartData[code].deadSections.includes(sec)) {
			optCartData[code].deadSections.push(sec);
		}
		// Si la seccion estaba fijada, la desfijamos automaticamente
		if (optCartData[code].lockedSection === sec) {
			optCartData[code].lockedSection = '';
		}
	} else {
		optCartData[code].deadSections = optCartData[code].deadSections.filter(
			(s) => s !== sec,
		);
	}
	updateOptCartUI();
}

function removeCourseFromOpt(code) {
	delete optCartData[code];
	updateOptCartUI();
}

function updateOptCartUI() {
	const cartDiv = document.getElementById('optCart');
	cartDiv.innerHTML = '';
	let totalCredits = 0;
	const codes = Object.keys(optCartData);
	document.getElementById('optCourseCount').innerText = codes.length;

	if (codes.length === 0) {
		cartDiv.innerHTML =
			'<p style="color: #888; font-size: 0.9em; text-align: center;">Agrega cursos usando el buscador.</p>';
	}

	codes.forEach((code) => {
		const course = courseDatabase[code];
		const conf = optCartData[code];
		const credits = optCreditsDB[code] || 3;
		totalCredits += credits;

		// --- pesos dinamicos por especialidad ---
		const selectedCareer =
			document.getElementById('optCareer')?.value || 'SOFTWARE';
		let defaultImp = 5;

		// Buscar si el curso es un cuello de botella en la carrera actual
		if (
			mallaData &&
			mallaData[selectedCareer] &&
			mallaData[selectedCareer][code]
		) {
			defaultImp = mallaData[selectedCareer][code];
		}

		// Si el usuario no ha tocado el slider manualmente, usar la matematica de la malla
		if (!conf.userModifiedImportance) {
			conf.importance = defaultImp;
		}
		// --------------------------------------------------

		let secOptions = `<option value="">Todas (Automático)</option>`;
		let deadChips = '';

		Object.keys(course.sections).forEach((sec) => {
			const isDead = conf.deadSections.includes(sec);

			// Si la seccion esta muerta, no dejamos que la fije en el dropdown
			if (!isDead) {
				secOptions += `<option value="${sec}" ${conf.lockedSection === sec ? 'selected' : ''}>Sec ${sec}</option>`;
			}

			// Construimos el chip
			deadChips += `
                <label class="dead-section-chip ${isDead ? 'dead' : ''}">
                    <input type="checkbox" ${isDead ? 'checked' : ''} onchange="toggleDeadSection('${code}', '${sec}', this)">
                    ${sec}
                </label>
            `;
		});

		const card = document.createElement('div');
		card.style.cssText =
			'background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; font-size: 0.85em; display: flex; flex-direction: column; gap: 8px;';
		card.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.1em; color: var(--btn-bg);">
                <span>${code} - ${course.name}</span>
                <span style="color: #dc3545; cursor: pointer; font-size: 1.2em; line-height: 1;" onclick="removeCourseFromOpt('${code}')">×</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
                <label style="cursor: pointer;"><input type="checkbox" onchange="optCartData['${code}'].obligatory = this.checked; saveOptState();" ${conf.obligatory ? 'checked' : ''}> Obligatorio</label>
                <span style="font-weight: 600; opacity: 0.8;">${credits} créditos</span>
            </div>
            <div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <label>Importancia (1-20):</label> <span id="impVal_${code}" style="font-weight:bold; color: var(--btn-bg);">${conf.importance}</span>
                </div>
                <input type="range" min="1" max="20" value="${conf.importance}" onchange="optCartData['${code}'].userModifiedImportance = true; saveOptState();" oninput="document.getElementById('impVal_${code}').innerText=this.value; optCartData['${code}'].importance=parseInt(this.value);">
            </div>
            <div>
                <label style="display: block; margin-bottom: 2px;">Fijar Sección (Obligar):</label>
                <select style="width: 100%; padding: 6px; border-radius: 4px; background: var(--bg-color); color: var(--text-color); border: 1px solid var(--border-color);" onchange="optCartData['${code}'].lockedSection = this.value; saveOptState();">
                    ${secOptions}
                </select>
            </div>
            <div style="background: rgba(220, 53, 69, 0.1); padding: 8px; border-radius: 4px; border: 1px dashed rgba(220, 53, 69, 0.3);">
                <label style="font-size: 0.9em; color: #dc3545; display: block; margin-bottom: 6px; font-weight: bold;">🚫 Secciones Llenas (Ignorar):</label>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    ${deadChips}
                </div>
            </div>
        `;
		cartDiv.appendChild(card);
	});

	const creditsEl = document.getElementById('optCurrentCredits');
	creditsEl.innerText = totalCredits;
	creditsEl.style.color =
		totalCredits > parseInt(document.getElementById('optMaxCredits').value)
			? '#dc3545'
			: 'var(--success)';
}

function executeOptimizer() {
	const codes = Object.keys(optCartData);
	if (codes.length === 0) return alert('Agrega al menos un curso.');

	if (!optWorker) {
		optWorker = new Worker('optimizer-worker.js');
		optWorker.onmessage = (e) => {
			document.getElementById('optLoading').style.display = 'none';
			renderOptResults(e.data.results);
		};
	}

	document.getElementById('optLoading').style.display = 'block';
	document.getElementById('optResults').innerHTML = '';

	// Sintetizar el tensor de valor de profesores (Curso -> Tipo -> Profesor = 1.0 a 0.1)
	let synthesizedRatings = {};
	Object.keys(complexTeacherOrder).forEach((code) => {
		// Sanity Check 1: Ignorar si el nodo esta corrupto
		if (
			typeof complexTeacherOrder[code] !== 'object' ||
			Array.isArray(complexTeacherOrder[code])
		)
			return;

		synthesizedRatings[code] = {};
		Object.keys(complexTeacherOrder[code]).forEach((type) => {
			const list = complexTeacherOrder[code][type];

			// Sanity Check 2: Ignorar si la lista final no es un Array real
			if (!Array.isArray(list)) return;

			synthesizedRatings[code][type] = {};
			const totalT = list.length;
			list.forEach((t, i) => {
				let normalized = 1.0;
				if (totalT > 1) normalized = 1.0 - (i / (totalT - 1)) * 0.9;
				synthesizedRatings[code][type][t] = { rating: normalized };
			});
		});
	});

	optWorker.postMessage({
		database: courseDatabase,
		creditsDB: optCreditsDB,
		cart: optCartData,
		ratings: synthesizedRatings,
		config: {
			creditsMax:
				parseInt(document.getElementById('optMaxCredits').value) || 24,
			apathy: parseFloat(document.getElementById('optApathy').value),
			busyBlocks: optBusyBlocks,
		},
	});
}

function renderOptResults(results) {
	const container = document.getElementById('optResults');
	if (results.length === 0) {
		container.innerHTML =
			'<p style="color:#dc3545; text-align:center;">No se encontró ninguna combinación válida que cumpla los créditos y cruces requeridos.</p>';
		return;
	}

	results.forEach((res, i) => {
		const div = document.createElement('div');
		div.style.cssText =
			'border: 1px solid var(--border-color); padding: 10px; border-radius: 6px; background: var(--surface-color); display:flex; flex-direction:column; gap:5px;';

		let gapWarning =
			res.maxGap >= 3
				? `<span style="color:#ff8c00; font-weight:bold;">⚠ Hueco Max: ${res.maxGap}h</span>`
				: `<span style="color:#28a745;">Hueco Max: ${res.maxGap}h</span>`;
		let overlapWarning =
			res.overlaps > 0
				? `<span style="color:#dc3545; font-weight:bold;">❌ Cruces: ${res.overlaps}</span>`
				: `<span style="color:#28a745;">✓ Cero Cruces</span>`;

		div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h4 style="margin: 0; color: var(--btn-bg);">Opción ${i + 1}</h4>
                <button onclick='loadOptimized(${JSON.stringify(res.schedule)})' style="padding: 4px 10px;">Cargar</button>
            </div>
            <div style="font-size: 0.85em; opacity: 0.9; display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 5px;">
                <span>Créditos: <strong>${res.credits}</strong></span>
                <span>Puntaje: <strong>${Math.round(res.score)}</strong></span>
                ${overlapWarning}
                ${gapWarning}
            </div>
        `;
		container.appendChild(div);
	});
}

function loadOptimized(scheduleArray) {
	if (
		selectedSections.length > 0 &&
		!confirm('Esto borrará tu horario actual. ¿Continuar?')
	)
		return;

	selectedSections = [];
	scheduleArray.forEach((sec) => {
		const course = courseDatabase[sec.courseCode];
		if (course && course.sections[sec.id]) {
			selectedSections.push({
				code: sec.courseCode,
				name: course.name,
				section: sec.id,
				sessions: JSON.parse(JSON.stringify(course.sections[sec.id])),
			});
		}
	});

	closePopups();
	refreshCalendar();
	saveStateToURL();
	showNotification('Horario generado aplicado con éxito.', 'success');
}

let optBusyBlocks = [];

function saveOptState() {
	const state = {
		cart: optCartData,
		credits: document.getElementById('optMaxCredits').value,
		apathy: document.getElementById('optApathy').value,
		teacherOrder: complexTeacherOrder,
		busyBlocks: optBusyBlocks,
		career: document.getElementById('optCareer').value,
	};
	localStorage.setItem('fiisOptimizerState', JSON.stringify(state));
}

function loadOptState() {
	const saved = localStorage.getItem('fiisOptimizerState');
	if (saved) {
		try {
			const state = JSON.parse(saved);
			optCartData = state.cart || {};
			if (state.credits)
				document.getElementById('optMaxCredits').value = state.credits;
			if (state.apathy)
				document.getElementById('optApathy').value = state.apathy;
			optBusyBlocks = state.busyBlocks || [];
			if (state.career)
				document.getElementById('optCareer').value = state.career;
			renderBusyBlocks();
			updateDynamicHeight();

			if (
				state.teacherOrder &&
				typeof state.teacherOrder === 'object' &&
				!Array.isArray(state.teacherOrder)
			) {
				complexTeacherOrder = state.teacherOrder;
			} else {
				complexTeacherOrder = {};
			}
		} catch (e) {
			console.error('Estado local corrupto. Reiniciando...');
			complexTeacherOrder = {};
		}
	}
}

function addBusyBlock() {
	const day = parseInt(document.getElementById('busyDay').value);
	const start = document.getElementById('busyStart').value;
	const end = document.getElementById('busyEnd').value;

	if (!start || !end || start >= end) return alert('Rango de horas inválido.');

	const dayNames = [
		'',
		'Lunes',
		'Martes',
		'Miércoles',
		'Jueves',
		'Viernes',
		'Sábado',
	];

	optBusyBlocks.push({
		day,
		start,
		end,
		label: `${dayNames[day]} de ${start} a ${end}`,
	});

	renderBusyBlocks();
	updateDynamicHeight();
	saveOptState();
}

function removeBusyBlock(idx) {
	optBusyBlocks.splice(idx, 1);

	renderBusyBlocks();
	updateDynamicHeight();
	saveOptState();
}

function renderBusyBlocks() {
	const container = document.getElementById('busyBlocksContainer');
	container.innerHTML = '';
	optBusyBlocks.forEach((block, idx) => {
		container.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(220, 53, 69, 0.1); border: 1px solid #dc3545; padding: 6px 10px; border-radius: 4px; font-size: 0.85em; color: var(--text-color);">
                <span style="font-weight: bold;">⛔ ${block.label}</span>
                <span style="color: #dc3545; cursor: pointer; font-size: 1.2em; font-weight: bold;" onclick="removeBusyBlock(${idx})">×</span>
            </div>
        `;
	});
}

function updateDynamicHeight() {
	const baseHeight = 425;
	const offset = optBusyBlocks.length * 40.5;
	const newHeight = baseHeight + offset;

	document.documentElement.style.setProperty(
		'--max-height-opt',
		`${newHeight}px`,
	);
}

// --- tensor de ranking de profes ---
let complexTeacherOrder = {}; // { BMA01: { T: [], P: [], LAB: [] } }
let activeTeacherTab = null;
let copySrc = null;
let copyDst = null;

function openTeacherModal() {
	const codes = Object.keys(optCartData);
	if (codes.length === 0) return alert('Agrega cursos primero.');

	codes.forEach((code) => {
		if (!complexTeacherOrder[code]) complexTeacherOrder[code] = {};
		const course = courseDatabase[code];

		let types = {};
		Object.values(course.sections).forEach((sessions) => {
			sessions.forEach((s) => {
				if (!types[s.type]) types[s.type] = new Set();
				if (s.teacher !== 'NN' && !s.teacher.includes('Solo para PC')) {
					types[s.type].add(s.teacher);
				}
			});
		});

		Object.keys(types).forEach((type) => {
			const currentList = Array.from(types[type]);
			let existingOrder = complexTeacherOrder[code][type] || [];
			let merged = existingOrder.filter((t) => currentList.includes(t));
			currentList.forEach((t) => {
				if (!merged.includes(t)) merged.push(t);
			});
			complexTeacherOrder[code][type] = merged;
		});
	});

	if (!activeTeacherTab || !codes.includes(activeTeacherTab)) {
		activeTeacherTab = codes[0];
	}

	document.getElementById('teacherModal').style.display = 'block';
	renderTeacherModalUI();
}

function renderTeacherModalUI() {
	// Render Tabs
	const tabsContainer = document.getElementById('teacherTabs');
	tabsContainer.innerHTML = '';
	Object.keys(optCartData).forEach((code) => {
		const tab = document.createElement('div');
		tab.className = `opt-tab ${code === activeTeacherTab ? 'active' : ''}`;
		tab.innerText = code;
		tab.onclick = () => {
			activeTeacherTab = code;
			renderTeacherModalUI();
		};
		tabsContainer.appendChild(tab);
	});

	const contentContainer = document.getElementById('teacherTabContent');
	contentContainer.innerHTML = '';

	const activeTypes = Object.keys(complexTeacherOrder[activeTeacherTab] || {});

	// Render Lists per Type
	activeTypes.forEach((type) => {
		const typeBlock = document.createElement('div');
		typeBlock.style.marginBottom = '15px';

		let typeName =
			type === 'T'
				? 'Teoría (T)'
				: type === 'P'
					? 'Práctica (P)'
					: 'Laboratorio (LAB)';
		let listHTML = `<h4 style="margin: 0 0 8px 0; color: var(--text-color); border-bottom: 1px solid var(--border-color); padding-bottom: 4px;">${typeName}</h4>`;

		complexTeacherOrder[activeTeacherTab][type].forEach((t, i) => {
			const isFirst = i === 0;
			const isLast =
				i === complexTeacherOrder[activeTeacherTab][type].length - 1;
			listHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-color); padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 4px; margin-bottom: 4px;">
                    <span style="font-size: 0.85em; font-weight: 600; width: 75%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        <span style="color:var(--btn-bg); margin-right:5px;">${i + 1}.</span> ${t}
                    </span>
                    <div style="display: flex; gap: 4px;">
                        <button onclick="moveTeacher('${activeTeacherTab}', '${type}', ${i}, -1)" ${isFirst ? 'disabled' : ''} style="${isFirst ? 'opacity:0.3;' : ''} padding: 2px 8px; margin: 0;">▲</button>
                        <button onclick="moveTeacher('${activeTeacherTab}', '${type}', ${i}, 1)" ${isLast ? 'disabled' : ''} style="${isLast ? 'opacity:0.3;' : ''} padding: 2px 8px; margin: 0;">▼</button>
                    </div>
                </div>
            `;
		});
		typeBlock.innerHTML = listHTML;
		contentContainer.appendChild(typeBlock);
	});

	// Render Copy Utility Engine
	renderCopyUtility(activeTypes);
}

function moveTeacher(code, type, idx, dir) {
	const temp = complexTeacherOrder[code][type][idx];
	complexTeacherOrder[code][type][idx] =
		complexTeacherOrder[code][type][idx + dir];
	complexTeacherOrder[code][type][idx + dir] = temp;
	renderTeacherModalUI();
	saveOptState();
}

function renderCopyUtility(types) {
	const srcContainer = document.getElementById('copySrcChips');
	const dstContainer = document.getElementById('copyDstChips');
	srcContainer.innerHTML = '';
	dstContainer.innerHTML = '';

	if (types.length < 2) {
		document.getElementById('btnExecuteCopy').disabled = true;
		document.getElementById('btnExecuteCopy').style.opacity = '0.3';
		return;
	}

	if (!types.includes(copySrc)) copySrc = types[0];
	let availableDst = types.filter((t) => t !== copySrc);
	if (!availableDst.includes(copyDst)) copyDst = availableDst[0];

	types.forEach((t) => {
		srcContainer.innerHTML += `<div class="copy-chip ${t === copySrc ? 'selected' : ''}" onclick="copySrc='${t}'; renderTeacherModalUI();">${t}</div>`;
	});

	types.forEach((t) => {
		const isSrc = t === copySrc;
		dstContainer.innerHTML += `<div class="copy-chip ${t === copyDst ? 'selected' : ''} ${isSrc ? 'disabled' : ''}" onclick="if(!${isSrc}){ copyDst='${t}'; renderTeacherModalUI(); }">${t}</div>`;
	});

	const btn = document.getElementById('btnExecuteCopy');
	btn.disabled = false;
	btn.style.opacity = '1';
	btn.innerHTML = `Copiar de <b>${copySrc}</b> a <b>${copyDst}</b>`;
}

function closeTeacherModal() {
	document.getElementById('teacherModal').style.display = 'none';
}

function executeTeacherCopy() {
	if (!copySrc || !copyDst) return;
	const srcList = complexTeacherOrder[activeTeacherTab][copySrc];
	let dstList = complexTeacherOrder[activeTeacherTab][copyDst];

	// Sort logic: match source index. If not in source, sink to bottom (999).
	dstList.sort((a, b) => {
		let idxA = srcList.indexOf(a);
		let idxB = srcList.indexOf(b);
		if (idxA === -1) idxA = 999;
		if (idxB === -1) idxB = 999;
		return idxA - idxB;
	});

	renderTeacherModalUI();
	saveOptState();
}


async function copyScheduleImage() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    showNotification('Renderizando imagen...', 'success');

    try {
        const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim() || '#121212';

        const canvas = await html2canvas(calendarEl, {
            scale: 2, // Multiplicador de resolución (evita que se vea borroso)
            useCORS: true,
            backgroundColor: bgColor, 
            logging: false // Apagar logs en consola
        });

        canvas.toBlob(async (blob) => {
            if (!blob) throw new Error("Fallo en la compresión del Blob.");

            try {
                
                const item = new ClipboardItem({ 'image/png': blob });
                await navigator.clipboard.write([item]);
                
                showNotification('¡Horario copiado al portapapeles!', 'success');
            } catch (clipboardErr) {
                // failsafe pq quiere https el muy m..
                console.error('Error de permisos del portapapeles:', clipboardErr);
                showNotification('Tu navegador bloqueó el acceso al portapapeles.', 'error');
            }
        }, 'image/png');

    } catch (err) {
        console.error('Fallo crítico en el renderizado del DOM:', err);
        showNotification('Fallo al generar la imagen.', 'error');
    }
}
