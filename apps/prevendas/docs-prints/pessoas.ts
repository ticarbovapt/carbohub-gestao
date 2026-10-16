export const PAPEL = (() => { try { return localStorage.getItem("mock-papel") || "colaborador"; } catch { return "colaborador"; } })();
const CORES = ["#65A30D", "#0EA5E9", "#F59E0B", "#8B5CF6"];
let k = 0;
const avatar = (nome: string) => {
  const ini = nome.split(" ").map((x) => x[0]).slice(0, 2).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' fill='${CORES[k++ % 4]}'/><text x='48' y='60' font-family='Arial' font-size='38' font-weight='700' fill='white' text-anchor='middle'>${ini}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
};
const p = (id: string, full_name: string, username: string, funcao: string) => ({
  id, full_name, username, avatar_url: avatar(full_name), department: "posto_seguro", funcao,
  secondary_department: null, secondary_funcao: null, allowed_interfaces: ["carbo_prevendas"], escopo: null,
  email: `${username.toLowerCase()}@postoseguro.com`,
});
export const U = {
  colab: p("u-colab", "Rafael Costa", "PSG010", "parceiro"),
  sdr2: p("u-sdr2", "Ana Souza", "PSG011", "parceiro"),
  gestor: p("u-gestor", "Marina Alves", "PSG001", "coordenacao"),
  closer: p("u-closer", "Bruno Lima", "PSG002", "coordenacao"),
};
export const EU = PAPEL === "gestor" ? U.gestor : U.colab;
