#!/bin/bash
# Script para criar os 3 usuários do time de Expansão
# Uso: SUPABASE_SERVICE_ROLE_KEY=xxx bash scripts/create-users-expansao.sh

BASE_URL="https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/create-team-member"
AUTH="Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "ERRO: SUPABASE_SERVICE_ROLE_KEY não definido."
  echo "Uso: SUPABASE_SERVICE_ROLE_KEY=xxx bash scripts/create-users-expansao.sh"
  exit 1
fi

echo "=== Criando Erick Almeida ==="
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{
    "email": "erick.almeida.grupocarbo@gmail.com",
    "fullName": "Erick Almeida",
    "department": "expansao",
    "role": "manager",
    "funcao": "Diretor de Expansão Nacional do Varejo",
    "escopo": "Crescimento da rede de licenciados ativação padronização suporte e performance nacional",
    "allowedInterfaces": ["carbo_ops"],
    "platformUrl": "https://controle.carbohub.com.br",
    "callerUserId": "0e64e57c-ec6b-4809-aaa9-6608f2861321"
  }' | jq .

echo ""
echo "=== Criando Lorran Barba ==="
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{
    "email": "lorran.kenzo.carbovapt@gmail.com",
    "fullName": "Lorran Barba",
    "department": "expansao",
    "role": "operator",
    "funcao": "Sucesso do Licenciado (Base)",
    "escopo": "Acompanhamento suporte e evolução de licenciados ativos",
    "allowedInterfaces": ["carbo_ops"],
    "platformUrl": "https://controle.carbohub.com.br",
    "callerUserId": "0e64e57c-ec6b-4809-aaa9-6608f2861321"
  }' | jq .

echo ""
echo "=== Criando Weider Moura ==="
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{
    "email": "weider.moura.grupocarbo@gmail.com",
    "fullName": "Weider Moura",
    "department": "expansao",
    "role": "operator",
    "funcao": "Consultor Comercial CarboZé e Pro",
    "escopo": "Vendas consultivas e gestão de contas",
    "allowedInterfaces": ["carbo_ops"],
    "platformUrl": "https://controle.carbohub.com.br",
    "callerUserId": "0e64e57c-ec6b-4809-aaa9-6608f2861321"
  }' | jq .

echo ""
echo "=== Concluído ==="
