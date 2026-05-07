# Script PowerShell para criar os 3 usuários do time de Expansão
# Uso:
#   1. Copie sua Service Role Key do Supabase Dashboard:
#      https://supabase.com/dashboard/project/wpkfirmapxevzpxjovjr/settings/api
#   2. Execute:
#      $env:SUPABASE_SERVICE_ROLE_KEY = "sua_chave_aqui"
#      .\scripts\create-users-expansao.ps1

$BASE_URL = "https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/create-team-member"

if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
    Write-Error "ERRO: SUPABASE_SERVICE_ROLE_KEY nao definido."
    Write-Host "Execute primeiro:"
    Write-Host '  $env:SUPABASE_SERVICE_ROLE_KEY = "sua_chave_aqui"'
    exit 1
}

$headers = @{
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
}

function Create-User($payload) {
    $body = $payload | ConvertTo-Json -Depth 5
    try {
        $response = Invoke-RestMethod -Uri $BASE_URL -Method Post -Headers $headers -Body $body
        Write-Host "OK - userId: $($response.userId)" -ForegroundColor Green
        return $response
    } catch {
        Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host $_.ErrorDetails.Message
    }
}

Write-Host ""
Write-Host "=== Criando Erick Almeida ===" -ForegroundColor Cyan
Create-User @{
    email              = "erick.almeida.grupocarbo@gmail.com"
    fullName           = "Erick Almeida"
    department         = "expansao"
    role               = "manager"
    funcao             = "Diretor de Expansao Nacional do Varejo"
    escopo             = "Crescimento da rede de licenciados, ativacao, padronizacao, suporte e performance nacional"
    allowedInterfaces  = @("carbo_ops")
    platformUrl        = "https://controle.carbohub.com.br"
    callerUserId       = "0e64e57c-ec6b-4809-aaa9-6608f2861321"
}

Write-Host ""
Write-Host "=== Criando Lorran Barba ===" -ForegroundColor Cyan
Create-User @{
    email              = "lorran.kenzo.carbovapt@gmail.com"
    fullName           = "Lorran Barba"
    department         = "expansao"
    role               = "operator"
    funcao             = "Sucesso do Licenciado (Base)"
    escopo             = "Acompanhamento, suporte e evolucao de licenciados ativos"
    allowedInterfaces  = @("carbo_ops")
    platformUrl        = "https://controle.carbohub.com.br"
    callerUserId       = "0e64e57c-ec6b-4809-aaa9-6608f2861321"
}

Write-Host ""
Write-Host "=== Criando Weider Moura ===" -ForegroundColor Cyan
Create-User @{
    email              = "weider.moura.grupocarbo@gmail.com"
    fullName           = "Weider Moura"
    department         = "expansao"
    role               = "operator"
    funcao             = "Consultor Comercial - CarboZe e Pro"
    escopo             = "Vendas consultivas e gestao de contas"
    allowedInterfaces  = @("carbo_ops")
    platformUrl        = "https://controle.carbohub.com.br"
    callerUserId       = "0e64e57c-ec6b-4809-aaa9-6608f2861321"
}

Write-Host ""
Write-Host "=== Concluido ===" -ForegroundColor Green
