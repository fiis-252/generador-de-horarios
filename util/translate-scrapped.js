const fs = require("fs");

let db1 = JSON.parse(fs.readFileSync("./database.json", "utf8"));
let db2 = JSON.parse(fs.readFileSync("./database2.json", "utf8"));

for (let course in db1) {
  // db1[course].sections = {};
  const courseSections = Object.values(db2[course].secciones).map((sec) => {
    return sec.seccion;
  });

  courseSections.forEach((section) => {
    db1[course].sections[section] = db2[course].secciones[
      courseSections.indexOf(section)
    ].horario.map((session) => {
      return {
        type:
          session.concepto == "PRA"
            ? "P"
            : session.concepto == "T"
              ? "T"
              : session.concepto == "LAB"
                ? "LAB"
                : null,
        day:
          session.dia == "Lunes"
            ? 1
            : session.dia == "Martes"
              ? 2
              : session.dia == "Miércoles"
                ? 3
                : session.dia == "Jueves"
                  ? 4
                  : session.dia == "Viernes"
                    ? 5
                    : 6,
        start: `${session.horaInicio}:00`,
        end: `${session.horaFin}:00`,
        teacher: session.docente || (db1[course].sections[section] ? db1[course].sections[section][0].teacher : null) || null,
        room: session.aula,
        vacantes: db2[course].secciones[courseSections.indexOf(section)].vacantesMaximas,
      };
    });
  });

  // break;
}

fs.writeFileSync("./database3.json", JSON.stringify(db1, null, 2), "utf8");
