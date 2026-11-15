rule suspicious_powershell_encoded : suspicious script
{
    meta:
        description = "Encoded or hidden PowerShell execution"
        author = "FSODefender"
    strings:
        $ps = "powershell" nocase
        $enc1 = "-enc" nocase
        $enc2 = "-encodedcommand" nocase
        $hidden = "-windowstyle hidden" nocase
        $dl1 = "downloadstring" nocase
        $dl2 = "invoke-webrequest" nocase
        $iex = "iex " nocase
    condition:
        $ps and any of ($enc*, $hidden) and any of ($dl1, $dl2, $iex)
}
