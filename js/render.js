export const shownotification = (message, type = "success") => {
  const toast = document.getElementById("notification-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  if (window.notificationtimeout) clearTimeout(window.notificationtimeout);
  window.notificationtimeout = setTimeout(
    () => toast.classList.remove("show"),
    3000,
  );
};

export const renderschedule = (spatialmatrix) => {
  const calendar = document.getElementById("calendar-grid");
  if (!calendar) return;

  calendar
    .querySelectorAll(".class-block, .time-slot-label, .grid-cell-bg")
    .forEach((e) => e.remove());
  const fragment = document.createDocumentFragment();

  let maxRow = window.innerWidth <= 800 ? 31 : 61;
  let mainAxisGridLineAmt = window.innerWidth <= 800 ? 2 : 4;
  for (let col = 2; col <= 7; col++) {
    // grid
    for (let row = 2; row <= maxRow; row++) {
      const cell = document.createElement("div");
      cell.className = "grid-cell-bg";
      cell.style.gridArea = `${row} / ${col} / ${row + 1} / ${col + 1}`;

      if ((row - 2) % mainAxisGridLineAmt === 0) {
        cell.style.borderTop = "1px solid var(--border-color)";
      }
      fragment.appendChild(cell);
    }
  }

  let timeSlotStart = window.innerWidth <= 800 ? 2 : 4;

  for (let hour = 8; hour <= 22; hour++) {
    // time-slot
    const rowstart = (hour - 8) * timeSlotStart + 2;
    const label = document.createElement("div");
    label.className = "time-slot-label";
    label.style.gridArea = `${rowstart} / 1 / ${rowstart + timeSlotStart} / 2`;
    label.textContent = `${hour}:00`;
    fragment.appendChild(label);
  }

  spatialmatrix.forEach((session) => {
    const block = document.createElement("div");
    block.className = "class-block";
    block.style.gridArea = session.gridarea;
    block.style.width = session.width;
    block.style.marginLeft = session.left;
    block.style.backgroundColor = session.color;

    const code = document.createElement("div");
    code.className = "class-code";
    code.textContent = `${session.code} - ${session.section}`;

    const title = document.createElement("div");
    title.className = "class-title";
    title.textContent = session.name;
    const pills = document.createElement("div");
    pills.className = "pill-container";
    pills.innerHTML = `
          <div class="pill-room" title="${session.room || "∅"}">${session.room || "∅"}</div>
          ${session["short-room"] ? `<div class="pill-room pill-room-short" title="${session["short-room"] || "∅"}">${session["short-room"] || "∅"}</div>` : ""}

          <div class="pill-type">${session.type}</div>
      `;

    block.appendChild(code);
    block.appendChild(title);
    block.appendChild(pills);
    fragment.appendChild(block);
  });

  calendar.appendChild(fragment);
};

export const rendersearchresults = (matches, db, onselect) => {
  const container = document.getElementById("search-results");
  if (!container) return;
  container.innerHTML = "";

  const fragment = document.createDocumentFragment();
  matches.forEach((code) => {
    const course = db[code];
    const btn = document.createElement("button");
    btn.className = "course-item-btn";
    btn.textContent = `${code} - ${course.name}`;
    btn.addEventListener("click", () => onselect(code));
    fragment.appendChild(btn);
  });
  container.appendChild(fragment);
};

export const rendersectionmodal = (
  code,
  db,
  currentschedule,
  onconfirm,
  onclose,
) => {
  const course = db[code];
  document.getElementById("modal-title").textContent =
    `${code} - ${course.name}`;
  const list = document.getElementById("modal-sections-list");
  list.innerHTML = "";

  const daynames = [
    "",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
  ];

  Object.keys(course.sections).forEach((secid) => {
    const sessions = course.sections[secid];
    const isenrolled = currentschedule.some(
      (s) => s.code === code && s.section === secid,
    );

    const block = document.createElement("div");
    block.className = "section-radio-block";
    block.innerHTML = `
          <label style="font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 1.1em; color: var(--accent-color);">
              <input type="radio" name="modal-sec-radio" value="${secid}" ${isenrolled ? "checked" : ""}> 
              Sección ${secid}
          </label>
          <table>
              <thead><tr><th>Tipo</th><th>Día</th><th>Horas</th><th>Profesor</th></tr></thead>
              <tbody>
                  ${sessions.map((s) => `<tr><td>${s.type}</td><td>${daynames[s.day]}</td><td>${s.start.slice(0, 5)} - ${s.end.slice(0, 5)}</td><td>${s.teacher}</td></tr>`).join("")}
              </tbody>
          </table>
      `;

    block.addEventListener("click", (e) => {
      if (e.target.tagName !== "INPUT") {
        const radio = block.querySelector("input");
        radio.checked = true;
      }
    });
    list.appendChild(block);
  });

  document.getElementById("btn-add-section").onclick = () => {
    const selected = document.querySelector(
      'input[name="modal-sec-radio"]:checked',
    );
    if (selected) onconfirm(code, selected.value);
  };

  document.getElementById("btn-close-modal").onclick = onclose;

  document.getElementById("modal-overlay").style.display = "block";
  document.getElementById("section-modal").showModal();
};

export const rendercart = (schedule, onremove) => {
  const container = document.getElementById("selected-courses-list");
  if (!container) return;
  container.innerHTML = "";

  const fragment = document.createDocumentFragment();

  schedule.forEach((course) => {
    const profset = new Set(
      course.sessions.map((s) => `[${s.type}] ${s.teacher}`),
    );
    let profs = Array.from(profset);
    if (profs.length === 0 || profs[0].includes("NN")) {
      profs = ["Profesor por asignar"];
    }

    const vacantes = course.sessions[0]?.vacantes || "-";

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.gap = "12px";
    wrapper.style.padding = "1rem";
    wrapper.style.marginBottom = "0.8rem";
    wrapper.style.backgroundColor = "var(--bg-base)";
    wrapper.style.border = "1px solid var(--border-color)";
    wrapper.style.borderRadius = "8px";
    wrapper.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";

    wrapper.innerHTML = `
          <div style="width: 16px; border-radius: 4px; background-color: ${course.color}; flex-shrink: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1);"></div>
          <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <strong style="font-size: 0.95em; color: var(--text-primary); line-height: 1.2;">
                      ${course.code} - ${course.name} <span style="opacity: 0.7;">(${course.section})</span>
                  </strong>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 0.75em; font-weight: 700; background: var(--border-grid); padding: 2px 8px; border-radius: 4px; color: var(--text-primary); border: 1px solid var(--border-color);">VACANTES: ${vacantes}</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
                  ${profs
                    .map(
                      (p) => `
                      <div style="font-size: 0.8em; color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
                          <span style="width: 4px; height: 4px; border-radius: 50%; background: var(--text-secondary);"></span>
                          ${p}
                      </div>
                  `,
                    )
                    .join("")}
              </div>
          </div>
      `;

    const btnContainer = document.createElement("div");
    const btn = document.createElement("button");
    btn.textContent = "Eliminar";
    btn.style.backgroundColor = "transparent";
    btn.style.color = "var(--danger-color)";
    btn.style.border = "1px solid var(--danger-color)";
    btn.style.padding = "4px 8px";
    btn.style.fontSize = "0.75rem";

    btn.addEventListener("mouseenter", () => {
      btn.style.backgroundColor = "var(--danger-color)";
      btn.style.color = "#ffffff";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.backgroundColor = "transparent";
      btn.style.color = "var(--danger-color)";
    });

    btn.onclick = () => onremove(course.code);
    btnContainer.appendChild(btn);

    wrapper.querySelector("strong").parentNode.appendChild(btnContainer);

    fragment.appendChild(wrapper);
  });

  container.appendChild(fragment);
};
