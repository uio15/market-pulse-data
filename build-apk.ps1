[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$hbuilderRoot = "C:\Users\fm\Desktop\HBuilderX"
$cliPath = Join-Path $hbuilderRoot "cli.exe"
$keytoolPath = Join-Path $hbuilderRoot "plugins\amazon-corretto\bin\keytool.exe"
$signingDir = Join-Path $projectRoot "signing"
$keystorePath = Join-Path $signingDir "market-pulse.keystore"
$passwordPath = Join-Path $signingDir "signing-password.txt"
$certificateAlias = "marketpulse"

if (!(Test-Path -LiteralPath $cliPath)) {
    throw "未找到 HBuilderX CLI：$cliPath"
}
if (!(Test-Path -LiteralPath $keytoolPath)) {
    throw "未找到 HBuilderX 内置 keytool：$keytoolPath"
}

New-Item -ItemType Directory -Path $signingDir -Force | Out-Null

if (!(Test-Path -LiteralPath $keystorePath)) {
    $passwordBytes = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
    $certificatePassword = [Convert]::ToBase64String($passwordBytes).TrimEnd("=")
    [IO.File]::WriteAllText($passwordPath, $certificatePassword, [Text.UTF8Encoding]::new($false))

    & $keytoolPath -genkeypair `
        -alias $certificateAlias `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -keystore $keystorePath `
        -storepass $certificatePassword `
        -keypass $certificatePassword `
        -dname "CN=Market Pulse, OU=Personal, O=Personal, L=Shanghai, ST=Shanghai, C=CN"
    if ($LASTEXITCODE -ne 0) {
        throw "Android 签名证书生成失败。"
    }
} else {
    if (!(Test-Path -LiteralPath $passwordPath)) {
        throw "签名密码文件缺失：$passwordPath"
    }
    $certificatePassword = [IO.File]::ReadAllText($passwordPath, [Text.Encoding]::UTF8).Trim()
}

& $cliPath pack `
    --project $projectRoot `
    --platform android `
    --android.packagename "com.personal.marketpulse" `
    --android.androidpacktype 0 `
    --android.certalias $certificateAlias `
    --android.certfile $keystorePath `
    --android.certpassword $certificatePassword `
    --android.storepassword $certificatePassword `
    --ignoreWarnings true

if ($LASTEXITCODE -ne 0) {
    throw "HBuilderX 云端打包未成功完成。"
}

Write-Output "云端打包任务已提交。请使用 HBuilderX CLI 的 pack status 查询结果。"
