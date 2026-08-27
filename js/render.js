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

export const renderschedule = (spatialmatrix, oncolorclick, onsectionclick) => {
  const calendar = document.getElementById("calendar-grid");
  if (!calendar) return;

  calendar
    .querySelectorAll(
      ".class-block, .time-slot-label, .grid-cell-bg, .grid-horizontal-line",
    )
    .forEach((e) => e.remove());
  const fragment = document.createDocumentFragment();

  for (let col = 2; col <= 7; col++) {
    for (let row = 2; row <= 58; row += 2) {
      const cell = document.createElement("div");
      cell.className = "grid-cell-bg";
      cell.style.gridArea = `${row + 2} / ${col} / ${row + 4} / ${col + 1}`;

      if ((row - 2) % 4 === 0) {
        cell.style.borderTop = "1px solid var(--border-color)";
      } else {
        cell.style.borderTop = "1px dashed var(--border-grid)";
      }

      fragment.appendChild(cell);
    }
  }

  for (let hour = 8; hour <= 22; hour++) {
    const rowstart = (hour - 8) * 4 + 2;
    const label = document.createElement("div");
    label.className = "time-slot-label";
    label.style.gridArea = `${rowstart} / 1 / ${rowstart + 4} / 2`;
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
    block.style.cursor = "pointer";

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

    block.addEventListener("click", () => {
      oncolorclick(session.code, session.color);
    });

    pills.addEventListener("click", (e) => {
      e.stopPropagation();
      onsectionclick(session.code);
    });

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

  if (
    document.getElementById("sidebar").className.split(" ").includes("open")
  ) {
    const overlay = document.getElementById("modal-overlay");

    overlay.style.display = "block";
    overlay.style.zIndex = "90";
  }

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

  document.getElementById("modal-overlay").style.zIndex = "999";
  document.getElementById("modal-overlay").style.display = "block";
  document.getElementById("section-modal").showModal();
};

export const rendercart = (
  schedule,
  onremove,
  oncolorclick,
  onsectionclick,
) => {
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
    wrapper.style.cursor = "pointer";
    wrapper.style.transition = "transform ease 0.1s";

    wrapper.addEventListener("mouseenter", () => {
      wrapper.classList.add("is-hovered");
    });

    wrapper.addEventListener("mouseleave", () => {
      wrapper.classList.remove("is-hovered");
    });

    wrapper.addEventListener("click", () => {
      onsectionclick(course.code);
    });

    const colordiv = document.createElement("div");
    colordiv.style.width = "16px";
    colordiv.style.borderRadius = "4px";
    colordiv.style.backgroundColor = course.color;
    colordiv.style.flexShrink = "0";
    colordiv.style.boxShadow = "inset 0 0 0 1px rgba(0,0,0,0.1)";
    colordiv.style.transition = "transform ease 0.1s";

    colordiv.addEventListener("mouseenter", () => {
      colordiv.classList.add("is-hovered");
    });

    colordiv.addEventListener("mouseleave", () => {
      colordiv.classList.remove("is-hovered");
    });

    colordiv.addEventListener("click", (e) => {
      e.stopPropagation();
      oncolorclick(course.code, course.color);
    });

    const infodiv = document.createElement("div");
    infodiv.style.flex = "1";
    infodiv.style.display = "flex";
    infodiv.style.flexDirection = "column";
    infodiv.style.gap = "8px";

    infodiv.innerHTML = `
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

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onremove(course.code);
    });

    btnContainer.appendChild(btn);
    infodiv.querySelector("strong").parentNode.appendChild(btnContainer);

    wrapper.appendChild(colordiv);
    wrapper.appendChild(infodiv);
    fragment.appendChild(wrapper);
  });

  container.appendChild(fragment);
};

export const rendercolormodal = (currentcolor, palette, onselect) => {
  const container = document.getElementById("color-swatches");
  container.innerHTML = "";

  palette.forEach((color) => {
    const swatch = document.createElement("div");
    swatch.style.width = "100%";
    swatch.style.aspectRatio = "1";
    swatch.style.backgroundColor = color;
    swatch.style.borderRadius = "4px";
    swatch.style.cursor = "pointer";
    swatch.style.boxShadow =
      color === currentcolor
        ? "0 0 0 2px var(--bg-surface), 0 0 0 4px var(--text-primary)"
        : "inset 0 0 0 1px rgba(0,0,0,0.1)";

    swatch.addEventListener("click", () => onselect(color));
    container.appendChild(swatch);
  });

  document.getElementById("modal-overlay").style.zIndex = "999";
  document.getElementById("modal-overlay").style.display = "block";
  document.getElementById("color-modal").showModal();
};
