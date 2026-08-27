// modifies 'database.json' (at bin) with new section values from 'database_raw.json' (at bin) 

import raw from '../bin/database_raw.json' with { type: 'json' } ;
import old from '../bin/database.json' with { type: 'json' };

import fs from 'fs'; 
const DAY_MAP = {
    'Domingo': 0,
    'Lunes': 1,
    'Martes': 2,
    'Miércoles': 3,
    'Miercoles': 3,
    'Jueves': 4,
    'Viernes': 5,
    'Sábado': 6,
    'Sabado': 6
};

function formatTime(timeStr) {
    if (!timeStr) return "00:00:00";
    return timeStr.split(':').length === 2 ? `${timeStr}:00` : timeStr;
}

const TYPE_MAP = {
    'T': 'T',
    'PRA': 'P',
    'P': 'P',
    'L': 'L',
    'LAB': 'L'
};

function transformSections(rawSecciones) {
    const formattedSections = {};

    if (!Array.isArray(rawSecciones)) return formattedSections;

    for (const sec of rawSecciones) {
        const sectionName = sec.seccion;
        const vacantes = sec.vacantesDisponibles ?? sec.vacantesMaximas ?? 0;
        
        formattedSections[sectionName] = (sec.horario || []).map(item => ({
            type: TYPE_MAP[item.concepto] || item.concepto || "T",
            day: DAY_MAP[item.dia] ?? 0,
            start: formatTime(item.horaInicio),
            end: formatTime(item.horaFin),
            teacher: item.docente || "POR ASIGNAR",
            room: item.aula || "SIN AULA",
            vacantes: vacantes,
            matriculados:  item.vacantesOcupadas
        }));
    }

    return formattedSections;
}

async function modifyData() {

    let old_db = old;   
    let raw_db = raw;
    
    for (const [course, rawData] of Object.entries(raw_db)) {

        const rawSec = rawData.secciones || rawData;
        const newSec = transformSections(rawSec); 

        if (old_db[course]) {
            old_db[course].sections = newSec;
        } else {
            old_db[course] = {
                name: rawData.nombre || course,
                "short-name": 'ERR-NO-SHORTHAND-NAME-APPLIED-HUMAN-ATTENTION-REQUIRED',
                sections: newSec
            }
        }
    }
    
    fs.writeFile('bin/database.json', JSON.stringify(old_db, null, 2), (err) => {
        if (err) {
            console.error('couldn\'t parse data');
        } 
        else {
            console.error('data parsed successfully');
        }
    });
}

modifyData();