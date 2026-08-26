const fs = require("fs");
const courseCodes = Object.keys(
  JSON.parse(fs.readFileSync("./database.json", "utf8")),
);

let headersList = {
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "en-US,en;q=0.9,es-US;q=0.8,es;q=0.7",
  Connection: "keep-alive",
  Cookie:
    "_ga_T1Y6Q7F07B=GS2.1.s1784129211$o1$g0$t1784129218$j53$l0$h0; _fbp=fb.2.1786727983074.426736051435861867; _ga=GA1.3.362988286.1784129211; MATRICULA-color-scheme=dark; accessToken=11736%7CymOf9pddMWg0QQQIlVj5LYIWUV9BXzpB6anvv1m4362ba16c; userData=%7B%22id%22%3A29346%2C%22name%22%3A%22CHRISTOPHER%20RICARDO%20ACOSTA%20SIMON%22%2C%22codigo%22%3A%2220251060I%22%2C%22email%22%3A%22c.acosta.s%40uni.pe%22%2C%22facultad%22%3A%22INGENIER%C3%8DA%20INDUSTRIAL%20Y%20DE%20SISTEMAS%22%2C%22escuela%22%3A%22INGENIER%C3%8DA%20DE%20SOFTWARE%22%7D; XSRF-TOKEN=eyJpdiI6IkQ4MmVlUmRHOWJKU1o0cUMzN21JT1E9PSIsInZhbHVlIjoiR3o5V1h3Rms3V2FiY0IyVGNKK0M1WlBURDYrOWFKZUg2cnNPclNzOXVQSW1ITnRmNzFwTzhQZmlyTVc0RmM4VDRnMlJWR0ZCQmVzRW1CL0VwcUY0NFJHQmJndVlSMGE5NG9HV0drRTkyei9SWXhzTWw5MGRsczNoWFczMnI4MWQiLCJtYWMiOiI0ZDczMGYzMTFhMGUyM2E2NGY5YjNmNzhhZjdlYWJmZDllMjkxZWVjNDNlMmQxMmE2NWJmNTQ2MWNjZjc4NjE2IiwidGFnIjoiIn0%3D; matricula-alumno-uni-session=eyJpdiI6Ikw0R2I4V21kbDgxMmswMFlBK1Z4b0E9PSIsInZhbHVlIjoiR0JGc0JNL1FUcnhnaEhZaXgwb2U4RHJJeFE4YUV5ck8yaThGZFlqRkxPcUdWeFR3aUZuNHh0WUpGUlhSREF3YWIwK04yMnlaUjFCZVZEQnY3ZDI1Z1MzK2J0QTlyTFh0bjdVQnUzaWp5ZmZtN0dwY2V6SWVsMXdvUGx5Q1NjVkgiLCJtYWMiOiIyMTNlZjEwNzQxMjQ1NWZiZThjMjI1YTNkYTMxNWQ0OWYzNGUxMDQwODdiNmRmYTUwYTgxMTM5ZjZjY2I0MzhhIiwidGFnIjoiIn0%3D",
  Host: "matricula-alumno.uni.edu.pe",
  Referer: "https://matricula-alumno.uni.edu.pe/cursos-disponibles",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  accept: "application/json",
  authorization:
    "Bearer 11736|ymOf9pddMWg0QQQIlVj5LYIWUV9BXzpB6anvv1m4362ba16c",
  "sec-ch-ua":
    '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

async function main() {
  const finalData = {};

  for (let code of courseCodes) {
    console.log(`fetching ${code}`)
    let response = await fetch(
      `https://matricula-alumno.uni.edu.pe/api/matricula/cursos/${code}/horarios`,
      {
        method: "GET",
        headers: headersList,
      },
    );
    let data = await response.json();
    finalData[code] = data;
  }

  fs.writeFileSync(
    "./database2.json",
    JSON.stringify(finalData, null, 2),
    "utf8",
  );
}

main();
