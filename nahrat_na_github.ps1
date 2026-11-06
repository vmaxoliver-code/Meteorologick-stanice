# =============================================================================
# PowerShell skript pro nahrání upravených souborů na GitHub
# Repozitář: https://github.com/vmaxoliver-code/Meteorologick-stanice
# =============================================================================

$repoUrl = "https://github.com/vmaxoliver-code/Meteorologick-stanice.git"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location -Path $projectDir

Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "🚀 NAHRÁVÁNÍ METEOSTANICE NA GITHUB (PowerShell)" -ForegroundColor Cyan
Write-Host "Cílový repozitář: $repoUrl" -ForegroundColor Gray
Write-Host "Složka projektu:  $projectDir" -ForegroundColor Gray
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Kontrola, zda je nainstalován Git
$gitCmd = Get-Command git -ErrorAction SilentlyContinue

if (-not $gitCmd) {
    # Zkusíme standardní cesty Git pro Windows
    $commonPaths = @(
        "C:\Program Files\Git\cmd\git.exe",
        "C:\Program Files (x86)\Git\cmd\git.exe",
        "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
    )
    foreach ($p in $commonPaths) {
        if (Test-Path $p) {
            $gitExe = $p
            break
        }
    }
} else {
    $gitExe = "git"
}

if (-not $gitExe) {
    Write-Host "❌ CHYBA: Nástroj Git nebyl na tomto počítači nalezen!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Postup pro zprovoznění:" -ForegroundColor Yellow
    Write-Host "1. Stáhněte a nainstalujte Git z oficiální stránky:" -ForegroundColor White
    Write-Host "   👉 https://git-scm.com/download/win" -ForegroundColor Cyan
    Write-Host "2. Po instalaci spusťte tento skript znovu." -ForegroundColor White
    Write-Host ""
    Write-Host "Stiskněte libovolnou klávesu pro otevření webu Git..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Start-Process "https://git-scm.com/download/win"
    exit 1
}

Write-Host "✅ Git nalezen: $gitExe" -ForegroundColor Green
Write-Host ""

# 2. Inicializace Git repozitáře (pokud ještě neexistuje)
if (-not (Test-Path ".git")) {
    Write-Host "📦 Inicializuji nový Git repozitář (.git)..." -ForegroundColor Yellow
    & $gitExe init
    & $gitExe branch -M main
}

# 3. Nastavení vzdáleného repozitáře (origin)
$existingRemotes = & $gitExe remote
if ($existingRemotes -contains "origin") {
    Write-Host "🔗 Aktualizuji adresu remote origin..." -ForegroundColor Yellow
    & $gitExe remote set-url origin $repoUrl
} else {
    Write-Host "🔗 Připojuji remote origin na GitHub..." -ForegroundColor Yellow
    & $gitExe remote add origin $repoUrl
}

# 4. Přidání souborů do gitu (respektuje .gitignore)
Write-Host "📄 Přidávám všechny upravené soubory (git add -A)..." -ForegroundColor Yellow
& $gitExe add -A

# 5. Vytvoření commitu
$commitMsg = "Aktualizace: mapa lokality Leaflet, barevný design #354fca a #62629d, oprava konfigurace pro Render"
Write-Host "💾 Vytvářím commit..." -ForegroundColor Yellow
& $gitExe commit -m $commitMsg

# 6. Odeslání na GitHub (Push)
Write-Host ""
Write-Host "⬆️ Odesílám soubory na GitHub do větve main..." -ForegroundColor Cyan
Write-Host "(Při první výzvě vás GitHub požádá o přihlášení ve webovém prohlížeči nebo token)." -ForegroundColor Gray
Write-Host ""

& $gitExe push -u origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "⚠️ Běžný push byl odmítnut (na GitHubu již mohou existovat jiné commity)." -ForegroundColor Yellow
    $confirm = Read-Host "Chcete provést vynucený přepis (force push: git push -u origin main --force)? [A/N]"
    if ($confirm -match '^[aAyY]') {
        Write-Host "⬆️ Provádím force push..." -ForegroundColor Yellow
        & $gitExe push -u origin main --force
    } else {
        Write-Host "Pokouším se o sloučení (git pull origin main --rebase)..." -ForegroundColor Yellow
        & $gitExe pull origin main --rebase
        & $gitExe push -u origin main
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=========================================================================" -ForegroundColor Green
    Write-Host "🎉 HOTOVO! Všechny soubory byly úspěšně nahrány na GitHub!" -ForegroundColor Green
    Write-Host "Repozitář: $repoUrl" -ForegroundColor Cyan
    Write-Host "Render.com nyní automaticky spustí nové nasazení." -ForegroundColor Green
    Write-Host "=========================================================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Nahrávání selhalo. Zkontrolujte přihlášení ke GitHubu nebo oprávnění." -ForegroundColor Red
}

Write-Host ""
Write-Host "Stiskněte libovolnou klávesu pro ukončení..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
