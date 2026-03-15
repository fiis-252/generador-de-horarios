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
        if (!response.ok)
            throw new Error(`HTTP error! status: ${response.status}`);
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
        loadStateFromURL();
    } catch (error) {
        // no se si poner esto en una notificacion
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

        if (
            normalizedCode.includes(normalizedQ) ||
            course.name.includes(rawQ)
        ) {
            const btn = document.createElement('button');
            btn.className = 'course-btn';
            btn.innerText = `${code} - ${course.name}`;
            btn.onclick = () => openSectionModal(code);
            resDiv.appendChild(btn);
        }
    });
    if (resDiv.innerHTML === '')
        resDiv.innerHTML = 'No se encontraron cursos.';
    else {
        document.getElementById('results').style.marginTop = '15px';
    }
}
function openSectionModal(code) {
    currentCourseCode = code;
    const course = courseDatabase[code];
    document.getElementById('popupTitle').innerText =
        `${code} - ${course.name}`;
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

    const sessionsCopy = JSON.parse(
        JSON.stringify(course.sections[secName]),
    );
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

    const customSelect = document.getElementById('customColorSelect');
    if (customSelect) customSelect.classList.remove('open');

    editingEventId = null;
}

function saveStateToURL() {
    let compressedURL = '';
    selectedSections.forEach((sec, i) => {
        sec.sessions.forEach((sess) => {
            const idStr = sess.id.toString(36).padStart(2, '0');
            const dayStr = sess.day.toString();
            const startStr = parseInt(sess.start.split(':')[0]).toString(36);
            const endStr = parseInt(sess.end.split(':')[0]).toString(36);
            let assignedColor = sess.color || FC_COLORS[i % FC_COLORS.length];
            let colorIdx = FC_COLORS.indexOf(assignedColor);

            if (colorIdx === -1) colorIdx = i % FC_COLORS.length;
            compressedURL += `${idStr}${dayStr}${startStr}${endStr}${colorIdx.toString(36)}`;
        });
    });
    const newUrl =
        window.location.protocol +
        '//' +
        window.location.host +
        window.location.pathname +
        '?s=' +
        compressedURL;
    window.history.replaceState({ path: newUrl }, '', newUrl);
    renderLegend();
}
function loadStateFromURL() {
    const state = new URLSearchParams(window.location.search).get('s');
    if (!state) {
        refreshCalendar();
        return;
    }
    selectedSections = [];
    const sectionsBuffer = {};

    for (let i = 0; i < state.length; i += 6) {
        const block = state.slice(i, i + 6);
        if (block.length < 6) continue;
        const id = parseInt(block.slice(0, 2), 36);
        const day = parseInt(block[2], 10);
        const start =
            parseInt(block[3], 36).toString().padStart(2, '0') + ':00:00';
        const end =
            parseInt(block[4], 36).toString().padStart(2, '0') + ':00:00';
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
                selectedSections[secIndex].sessions[sessIndex].end = toTimeStr(
                    evt.end,
                );
                saveStateToURL();
            },
            eventClick: function (info) {
                editingEventId = info.event.id;

                let color = info.event.backgroundColor;
                if (FC_COLORS.indexOf(color) === -1) color = FC_COLORS[0];

                // Bind data to our custom component instead of a native input
                const customSelect = document.getElementById('customColorSelect');
                customSelect.setAttribute('data-value', color);
                document.getElementById('triggerDot').style.backgroundColor =
                    color;
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

    // Read the state from the custom component's data-value attribute
    const selectedColor = document
        .getElementById('customColorSelect')
        .getAttribute('data-value');
    selectedSections[secIndex].sessions[sessIndex].color = selectedColor;

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
    selectedSections = selectedSections.filter(
        (s) => s.code !== courseCode,
    );

    saveStateToURL();
    refreshCalendar();
}
function downloadICS() {
    if (selectedSections.length === 0) {
        showNotification('El horario está vacío.', 'error');
        return;
    }
    let icsMSG =
        'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//xd//ES\n';
    const monday = getMonday();
    const fmt = (d) =>
        d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
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