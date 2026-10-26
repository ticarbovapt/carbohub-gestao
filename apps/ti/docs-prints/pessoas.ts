// Pessoas FICTÍCIAS dos prints da Documentação. Nenhum nome é de alguém real.
export const PAPEL = (() => { try { return localStorage.getItem("mock-papel") || "colaborador"; } catch { return "colaborador"; } })();
const CORES = ["#3BC770", "#0EA5E9", "#F59E0B", "#8B5CF6"];
let k = 0;
const avatar = (nome: string) => {
  const ini = nome.split(" ").map((x) => x[0]).slice(0, 2).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' fill='${CORES[k++ % 4]}'/><text x='48' y='60' font-family='Arial' font-size='38' font-weight='700' fill='white' text-anchor='middle'>${ini}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
};
const p = (id: string, full_name: string, username: string, funcao: string) => ({
  id, full_name, username, avatar_url: avatar(full_name), department: "ti_suporte", funcao,
  secondary_department: null, secondary_funcao: null, allowed_interfaces: ["carbo_ti", "carbo_crm"], escopo: null,
  email: `${username.toLowerCase()}@exemplo.com.br`, phone: "(84) 99999-0000", status: "active", manager_user_id: null,
});
export const U = {
  colab: p("u-colab", "Rafael Costa", "TI010", "analista"),
  vend2: p("u-vend2", "Ana Souza", "TI011", "analista"),
  gestor: p("u-gestor", "Marina Alves", "TI001", "gerente"),
  closer: p("u-closer", "Bruno Lima", "TI002", "analista"),
};
export const EU = PAPEL === "gestor" ? U.gestor : U.colab;
