import { Navigate, useLocation, useParams } from "react-router-dom";

// ─────────────────────────────────────────────────────────────────────────────
// Endereço ANTIGO → endereço novo, levando a query e o hash junto.
//
// Pedido do dono do processo (29/10/2026): slug em português e igual ao nome do
// menu. Renomear rota sem isto quebra favorito, link mandado no chat, link do
// sininho e do celular — e quebra CALADO: o endereço velho cai no "página não
// encontrada" ou na home. `<Navigate to="/x">` puro descarta a query, e é ela
// que carrega filtro, período, página e o `?pedido=` que abre o card.
//
// `para` aceita os parâmetros da rota antiga (`/quadros/:boardId/painel`): eles
// são trocados pelos valores do endereço que chegou.
// ─────────────────────────────────────────────────────────────────────────────
export function IrPara({ para }: { para: string }) {
  const { search, hash } = useLocation();
  const params = useParams();
  const destino = para.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, nome: string) =>
    encodeURIComponent(params[nome] ?? ""),
  );
  return <Navigate to={destino + search + hash} replace />;
}
