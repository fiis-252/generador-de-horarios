import {
  createstate,
  addcourse,
  removecourse,
  generatespatialmatrix,
  calculatetotalcredits,
  changecoursecolor,
  catppuccin_palette,
} from "./state.js";
import { encodepayload, decodepayload } from "./url.js";
import {
  renderschedule,
  rendersearchresults,
  rendersectionmodal,
  rendercart,
  rendercolormodal,
  shownotification,
} from "./render.js";

let appstate = createstate();

const initializeapp = async () => {
  try {
    const response = await fetch("./database.json");
    if (!response.ok) throw new Error("database.json fetch failed");
    appstate.database = await response.json();

    initsettings();
    bindevents();

    await loadstatefromurl();
    updateui();
  } catch (error) {
    shownotification("error fatal: fallo al cargar database.json", "error");
  }
};

const initsettings = () => {
  const savedtheme = localStorage.getItem("fiis_sched_theme") || "dark";
  appstate.settings.theme = savedtheme;
  document.documentElement.setAttribute("data-theme", savedtheme);
};

const loadstatefromurl = async () => {
  const urlparams = new URLSearchParams(window.location.search);
  if (!urlparams.has("p")) return;

  try {
    const decoded = await decodepayload(urlparams.get("p"));
    decoded.forEach((item) => {
      if (
        appstate.database[item.code] &&
        appstate.database[item.code].sections[item.section]
      ) {
        appstate.schedule = addcourse(
          appstate.schedule,
          appstate.database,
          item.code,
          item.section,
        );
      }
    });
  } catch (error) {
    console.error(error);
    shownotification(
      "enlace corrupto o incompatible. cargando horario vacío.",
      "error",
    );
    window.history.replaceState({}, "", window.location.pathname);
  }
};

const updatestate = async () => {
  updateui();

  try {
    if (appstate.schedule.length === 0) {
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    const base64str = await encodepayload(appstate.schedule);
    const newurl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?p=${base64str}`;
    window.history.replaceState({ path: newurl }, "", newurl);
  } catch (error) {
    shownotification("error al generar enlace", "error");
  }
};

let activemodalcode = null;

const handlecolorclick = (code, currentcolor) => {
  activemodalcode = code;
  rendercolormodal(currentcolor, catppuccin_palette, (newcolor) => {
    appstate.schedule = changecoursecolor(
      appstate.schedule,
      activemodalcode,
      newcolor,
    );
    closemodal();
    updatestate();
  });
};

const handlesectionclick = (code) => {
  rendersectionmodal(
    code,
    appstate.database,
    appstate.schedule,
    (selectedcode, section) => {
      const existingcourse = appstate.schedule.find(
        (c) => c.code === selectedcode,
      );
      const preservedcolor = existingcourse ? existingcourse.color : null;

      appstate.schedule = addcourse(
        appstate.schedule,
        appstate.database,
        selectedcode,
        section,
        preservedcolor,
      );
      document.getElementById("search-input").value = "";
      rendersearchresults([], appstate.database, null);
      closemodal();
      updatestate();
    },
    closemodal,
  );
};

const updateui = () => {
  const matrix = generatespatialmatrix(appstate.schedule);
  renderschedule(matrix, handlecolorclick, handlesectionclick);

  rendercart(
    appstate.schedule,
    (code) => {
      appstate.schedule = removecourse(appstate.schedule, code);
      updatestate();
    },
    handlecolorclick,
    handlesectionclick,
  );

  const creditsdb = {};
  // document.getElementById("credit-counter").textContent = calculatetotalcredits(
  //     appstate.schedule,
  //     creditsdb,
  // );
};

const closemodal = () => {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("modal-overlay");
  // const overlay = document.getElementById("modal-overlay");

  document.getElementById("section-modal").close();

  const colormodal = document.getElementById("color-modal");
  if (colormodal.open) colormodal.close();

  // console.log(activemodalcode)
  activemodalcode = null;

  if (sidebar.classList.contains("open")) {
    overlay.style.display = "block";
    overlay.style.zIndex = "90";
  } else {
    overlay.style.display = "none";
    overlay.style.zIndex = "999";
  }
};

// overlay.style.display = "block";
// overlay.style.zIndex = "90";
const overlay = document.getElementById("modal-overlay");

overlay.onclick = () => {
  // sidebar.classList.remove("open");
  overlay.style.display = "none";
  overlay.style.zIndex = "999";
  overlay.onclick = null;
};

const bindevents = () => {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("modal-overlay");

  overlay.addEventListener("click", () => {
    const sectionmodal = document.getElementById("section-modal");
    const colormodal = document.getElementById("color-modal");

    if (sectionmodal.open || colormodal.open) {
      closemodal();
    } else if (sidebar.classList.contains("open")) {
      sidebar.classList.remove("open");
      overlay.style.display = "none";
      overlay.style.zIndex = "999";
    }
  });

  document.getElementById("btn-menu-toggle").addEventListener("click", () => {
    sidebar.classList.add("open");
    overlay.style.display = "block";
    overlay.style.zIndex = "90";
  });

  document
    .getElementById("btn-close-color-modal")
    .addEventListener("click", closemodal);

  const searchinput = document.getElementById("search-input");
  searchinput.addEventListener("input", (e) => {
    const query = e.target.value.trim().toUpperCase().replace(/-/g, "");
    if (!query) {
      rendersearchresults([], appstate.database, null);
      return;
    }
    const matches = Object.keys(appstate.database).filter(
      (code) =>
        code.replace(/-/g, "").includes(query) ||
        appstate.database[code].name.toUpperCase().includes(query),
    );

    rendersearchresults(matches, appstate.database, handlesectionclick);
  });

  document.getElementById("btn-theme-toggle").addEventListener("click", () => {
    const newtheme = appstate.settings.theme === "dark" ? "light" : "dark";
    appstate.settings.theme = newtheme;
    document.documentElement.setAttribute("data-theme", newtheme);
    localStorage.setItem("fiis_sched_theme", newtheme);
  });

  document
    .getElementById("btn-export-url")
    .addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        shownotification("enlace copiado al portapapeles", "success");
      } catch (err) {
        shownotification("error al copiar enlace", "error");
      }
    });
};

document.addEventListener("DOMContentLoaded", initializeapp);
