#requires -Version 5.1
<#
从 DeepSeek Harness 的 desktop profile 卸载 DeepSeek 搜索。
默认保留 ~/.dsh/deepseek-search/config.json；加 -PurgeConfig 一并删除。
#>
[CmdletBinding()]
param(
    [string]$InstallDir = '',
    [switch]$Force,
    [switch]$PurgeConfig,
    [switch]$NoPause
)

$ErrorActionPreference = 'Stop'

function Find-DshCli {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($InstallDir) { $candidates.Add($InstallDir) }
    if ($env:DSH_INSTALL_DIR) { $candidates.Add($env:DSH_INSTALL_DIR) }
    $candidates.Add('D:\deepseekharness')
    $candidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness'))
    $candidates.Add((Join-Path $env:ProgramFiles 'DeepSeek Harness'))
    foreach ($root in $candidates) {
        if (-not $root) { continue }
        $cli = Join-Path $root 'resources\runtime\cli\bin\dsh.cmd'
        if (Test-Path -LiteralPath $cli) { return $cli }
    }
    return $null
}

Write-Host "DeepSeek 搜索 · 卸载" -ForegroundColor Green

$running = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like '*DeepSeek*' -or $_.ProcessName -like '*deepseek*'
}
if ($running -and -not $Force) {
    Write-Host "检测到 DeepSeek Harness 正在运行，请先完全退出。" -ForegroundColor Yellow
    exit 1
}

$cli = Find-DshCli
if (-not $cli) {
    Write-Host "没有找到 dsh.cmd，请用 -InstallDir 指定安装目录。" -ForegroundColor Red
    exit 1
}

& $cli plugin --profile desktop remove dsh-deepseek-search
if ($LASTEXITCODE -ne 0) {
    Write-Host "卸载命令失败（退出码 $LASTEXITCODE）。可手动编辑 profile 的 package.json。" -ForegroundColor Yellow
    exit $LASTEXITCODE
}

if ($PurgeConfig) {
    $configDir = Join-Path $env:USERPROFILE '.dsh\deepseek-search'
    if (Test-Path -LiteralPath $configDir) {
        Remove-Item -LiteralPath $configDir -Recurse -Force
        Write-Host "已删除配置目录: $configDir"
    }
}

Write-Host "卸载完成。请重新启动 DeepSeek Harness。" -ForegroundColor Green
if (-not $NoPause -and $Host.Name -eq 'ConsoleHost') {
    Read-Host "按回车退出" | Out-Null
}
