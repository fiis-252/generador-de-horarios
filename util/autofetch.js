// this will autofetch the schedule from 'https://matricula-alumno.uni.edu.pe' during enrollment, this means, dynamic vacants will be shown.
// Lucksin god thx por el fetcher xdddddd

import fs from 'fs';

async function luckyFetcher() {
    const CODES = ["BEF01", "BEG01", "BFI01", "BIC01", "BMA01", "BMA02", "BMA03", "BQU01", "BRC01", "BRN01", "FB101", "FB202", "FB301", "FB303", "FB305", "FB401", "FB402", "FB403", "FB405", "FB501", "GE003", "GE004", "GE101", "GE112", "GE113", "GE122", "GE124", "GE128", "GE501", "GE502", "GE602", "GE603", "GE604", "GE605", "GE701", "GE702", "GE703", "GE704", "GE709", "GE801", "GE802", "GE803", "GE805", "GE901", "GE902", "GE903", "GE905", "GE906", "HU102", "HU111", "HU112", "HU201", "HU301", "HU500", "HU501", "IA001", "SI036", "SI055", "SI075", "SI077", "SI085", "SI095", "SI111", "SI114", "SI121", "SI130", "SI150", "SI155", "SI205", "SI302", "SI322", "SI401", "SI403", "SI405", "SI421", "SI422", "SI501", "SI503", "SI505", "SI601", "SI602", "SI603", "SI604", "SI605", "SI607", "SI701", "SI702", "SI704", "SI705", "SI707", "SI801", "SI805", "SI806", "SI807", "SI902", "SI903", "SI904", "SI905", "SW101", "SW112", "SW301", "SW303", "SW305", "SW403", "SW405", "SW407", "SW501", "SW503", "SW505", "SW507", "SW603", "SW605", "SW608", "SW609", "SW701", "SW703", "SW705", "SW707", "SW708", "SW709", "TE111", "TE121", "TE122", "TE124", "TE126", "TE205", "TE301", "TE302", "TE401", "TE501", "TE503", "TE601", "TE602", "TE603", "TE604", "TE701", "TE801", "TE802", "TE803", "TE901"];

    const TOKEN = "";

    const headers = {
        "accept": "application/json",
        "authorization": `Bearer ${TOKEN}`,
    };

    const resultado = {};
    const fallidos = [];

    for (let i = 0; i < CODES.length; i++) {
        const code = CODES[i];
        try {
            const res = await fetch(`https://matricula-alumno.uni.edu.pe/api/matricula/cursos/${code}/horarios`, {
                headers,
                credentials: "include",
            });
            if (res.ok) {
                const data = await res.json();
                resultado[code] = data;
                console.log(`[${i + 1}/${CODES.length}] OK ${code}`);
            } else {
                fallidos.push({ code, status: res.status });
                console.warn(`[${i + 1}/${CODES.length}] FALLO ${code} (${res.status})`);
            }
        } catch (e) {
            fallidos.push({ code, error: String(e) });
            console.warn(`[${i + 1}/${CODES.length}] ERROR ${code}`, e);
        }
        // pequeña pausa para no saturar el servidor
        await new Promise(r => setTimeout(r, 250));
    }

    console.log("=== TERMINADO ===");
    console.log("Cursos ok:", Object.keys(resultado).length, "Fallidos:", fallidos.length);
    if (fallidos.length) {
        console.warn("Fallidos:", );
        console.error('raw data failed to fetch', fallidos, 'of 140');

        return;
    } 

    fs.writeFile('../bin/database_raw.json', JSON.stringify(resultado, null, 2), (e) => {
        if (e) {
            console.error('couldn\'t fetch data');
        }
        else {
            console.log('raw data fetched successfully');
        }
    })
}

luckyFetcher();