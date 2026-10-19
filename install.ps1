#requires -Version 5.1
<#
把 DeepSeek 搜索以 link: 方式安装到 DeepSeek Harness 的 desktop profile。
安装前请完全退出 DeepSeek Harness。
#>
[CmdletBinding()]
param(
    [string]$InstallDir = '',
    [switch]$Force,
    [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
$pluginDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Find-DshCli {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($InstallDir) { $candidates.Add($InstallDir) }
    if ($env:DSH_INSTALL_DIR) { $candidates.Add($env:DSH_INSTALL_DIR) }
    $candidates.Add('D:\deepseekharness')
    $candidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness'))
    $candidates.Add((Join-Path $env:ProgramFiles 'DeepSeek Harness'))
    if (${env:ProgramFiles(x86)}) {
        $candidates.Add((Join-Path ${env:ProgramFiles(x86)} 'DeepSeek Harness'))
    }
    foreach ($root in $candidates) {
        if (-not $root) { continue }
        $cli = Join-Path $root 'resources\runtime\cli\bin\dsh.cmd'
        if (Test-Path -LiteralPath $cli) { return $cli }
    }
    return $null
}

Write-Host "DeepSeek 搜索 · 安装" -ForegroundColor Green
Write-Host "插件目录: $pluginDir"

$running = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like '*DeepSeek*' -or $_.ProcessName -like '*deepseek*'
}
if ($running -and -not $Force) {
    Write-Host ""
    Write-Host "检测到 DeepSeek Harness 正在运行：" -ForegroundColor Yellow
    $running | Select-Object Id, ProcessName | Format-Table -AutoSize | Out-String | Write-Host
    Write-Host "请先完全退出 DeepSeek Harness（包括托盘图标），然后重新运行本脚本。" -ForegroundColor Yellow
    Write-Host "如果确认可以继续，运行: .\install.ps1 -Force" -ForegroundColor Yellow
    exit 1
}

$cli = Find-DshCli
if (-not $cli) {
    Write-Host "没有找到 dsh.cmd。请用 -InstallDir 指定 DeepSeek Harness 安装目录，例如：" -ForegroundColor Red
    Write-Host '  .\install.ps1 -InstallDir "D:\deepseekharness"' -ForegroundColor Red
    exit 1
}

$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
if (-not (Test-Path -LiteralPath (Join-Path $profileDir 'package.json'))) {
    Write-Host "desktop profile 还没有初始化。请先打开一次 DeepSeek Harness 桌面端，再退出并重试。" -ForegroundColor Red
    exit 1
}

$linkSpec = 'link:' + ($pluginDir -replace '\\', '/')
Write-Step "安装到 desktop profile"
Write-Host "命令: `"$cli`" plugin --profile desktop add `"$linkSpec`""
& $cli plugin --profile desktop add $linkSpec
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "dsh plugin add 失败（退出码 $LASTEXITCODE）。" -ForegroundColor Red
    Write-Host "请确认 DeepSeek Harness 已完全退出，或查看上面的 pnpm 输出。" -ForegroundColor Yellow
    exit $LASTEXITCODE
}

Write-Step "验证 profile"
$manifestPath = Join-Path $profileDir 'package.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$dependency = $manifest.dependencies.'dsh-deepseek-search'
$bundles = @($manifest.dsh.profile.bundles)
if (-not $dependency) {
    Write-Host "警告：package.json 的 dependencies 里没有 dsh-deepseek-search。" -ForegroundColor Yellow
} else {
    Write-Host "依赖: $dependency"
}
if ($bundles -notcontains 'dsh-deepseek-search') {
    Write-Host "警告：dsh.profile.bundles 里没有 dsh-deepseek-search；请重新运行安装或手动检查。" -ForegroundColor Yellow
} else {
    Write-Host "bundle: dsh-deepseek-search 已加入"
}

Write-Step "完成"
Write-Host "请重新启动 DeepSeek Harness，然后打开：设置 → DeepSeek 搜索。" -ForegroundColor Green
Write-Host "在设置页点一次“试搜”，确认必应/百度等引擎返回结果。" -ForegroundColor Green
Write-Host ""
Write-Host "如果原生 web_search 仍走 DeepSeek 官方搜索，请检查 profile 的 cordis.patch.yml 是否包含：" -ForegroundColor DarkGray
Write-Host "  - id: web`n    config:`n      searchProvider: deepseek-search" -ForegroundColor DarkGray

if (-not $NoPause -and $Host.Name -eq 'ConsoleHost') {
    Write-Host ""
    Read-Host "按回车退出" | Out-Null
}
