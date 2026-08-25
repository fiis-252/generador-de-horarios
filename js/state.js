export const createstate = () => ({
  schedule: [],
  settings: {
    theme: "dark",
  },
});

export const parsetimestr = (timestr) => {
  if (!timestr || typeof timestr !== "string") {
    throw new TypeError("invalid timestr");
  }
  const parts = timestr.split(":");
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) {
    throw new TypeError("timestr parse failed");
  }
  return hours * 60 + minutes;
};

export const timetogridrow = (timestr, basehour = 8) => {
  const [hours, minutes] = timestr.split(":").map(Number);
  const houroffset = hours - basehour;
  return houroffset * (window.innerWidth <= 800 ? 2 : 4) + Math.floor(minutes / 15) + 2; // +2 cause +1 is the header, so we need to account for that
};

const catppuccin_palette = [
  "var(--cat-1)",
  "var(--cat-2)",
  "var(--cat-3)",
  "var(--cat-4)",
  "var(--cat-5)",
  "var(--cat-6)",
  "var(--cat-7)",
  "var(--cat-8)",
  "var(--cat-9)",
  "var(--cat-10)",
  "var(--cat-11)",
  "var(--cat-12)",
  "var(--cat-13)",
  "var(--cat-14)",
];

export const assigncolor = (currentschedule) => {
  const usedcolors = currentschedule.map((s) => s.color);
  const available = catppuccin_palette.filter((c) => !usedcolors.includes(c));
  if (available.length > 0) return available[0];
  return catppuccin_palette[currentschedule.length % catppuccin_palette.length];
};

export const calculateoverlaps = (sessions) => {
  const processed = [];

  for (let day = 1; day <= 7; day++) {
    const daysessions = sessions.filter((s) => s.day === day);
    if (daysessions.length === 0) continue;

    daysessions.sort((a, b) => {
      const startdiff = timetogridrow(a.start) - timetogridrow(b.start);
      if (startdiff === 0) {
        return timetogridrow(b.end) - timetogridrow(a.end);
      }
      return startdiff;
    });

    let cluster = [];
    let clusterend = 0;

    const processcluster = (clusternodes) => {
      const columns = [];
      for (const session of clusternodes) {
        const startrow = timetogridrow(session.start);
        let placed = false;
        for (let i = 0; i < columns.length; i++) {
          const column = columns[i];
          const lastsession = column[column.length - 1];
          if (timetogridrow(lastsession.end) <= startrow) {
            column.push(session);
            session.subcolumn = i;
            placed = true;
            break;
          }
        }
        if (!placed) {
          session.subcolumn = columns.length;
          columns.push([session]);
        }
      }
      for (const session of clusternodes) {
        session.totalcolumns = columns.length;
        processed.push(session);
      }
    };

    for (const session of daysessions) {
      const startrow = timetogridrow(session.start);
      const endrow = timetogridrow(session.end);

      if (cluster.length > 0 && startrow >= clusterend) {
        processcluster(cluster);
        cluster = [];
      }

      cluster.push(session);
      clusterend = Math.max(clusterend, endrow);
    }

    if (cluster.length > 0) {
      processcluster(cluster);
    }
  }

  return processed;
};

export const addcourse = (currentschedule, db, coursecode, sectionid) => {
  if (!db[coursecode] || !db[coursecode].sections[sectionid]) {
    throw new Error("invalid course or section");
  }

  const filtered = currentschedule.filter((s) => s.code !== coursecode);
  const color = assigncolor(filtered);

  const sessionsraw = JSON.parse(
    JSON.stringify(db[coursecode].sections[sectionid]),
  );
  const mappedsessions = sessionsraw.map((sess) => ({
    ...sess,
    code: coursecode,
    section: sectionid,
    name: db[coursecode].name,
    color: color,
  }));

  return [
    ...filtered,
    {
      code: coursecode,
      name: db[coursecode].name,
      section: sectionid,
      color: color,
      sessions: mappedsessions,
    },
  ];
};

export const removecourse = (currentschedule, coursecode) => {
  return currentschedule.filter((s) => s.code !== coursecode);
};

export const generatespatialmatrix = (currentschedule) => { // blocks
  const allsessions = currentschedule.flatMap((course) => course.sessions);
  const overlapped = calculateoverlaps(allsessions);

  return overlapped.map((session) => {
    const gridcolumn = session.day + 1;
    const gridrowstart = timetogridrow(session.start);
    const gridrowend = timetogridrow(session.end);

    const width = 100 / session.totalcolumns;
    const left = session.subcolumn * width;

    return {
      ...session,
      gridarea: `${gridrowstart} / ${gridcolumn} / ${gridrowend} / ${gridcolumn + 1}`,
      width: `${width}%`,
      left: `${left}%`,
    };
  });
};

export const calculatetotalcredits = (currentschedule, creditsdb) => {
  return currentschedule.reduce((total, course) => {
    const creds = creditsdb[course.code] || 0;
    return total + creds;
  }, 0);
};
