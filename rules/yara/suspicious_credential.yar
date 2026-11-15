rule suspicious_credential_theft : suspicious stealer
{
    meta:
        description = "References browser credential stores"
        author = "FSODefender"
    strings:
        $target1 = "Login Data" ascii wide
        $target2 = "wallet.dat" ascii wide nocase
        $target3 = "Web Data" ascii wide
        $path1 = "\\Google\\Chrome\\User Data" nocase
        $path2 = "\\Mozilla\\Firefox\\Profiles" nocase
        $path3 = "\\Microsoft\\Edge\\User Data" nocase
    condition:
        any of ($target*) and any of ($path*)
}
