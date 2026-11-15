rule suspicious_office_vba_autoexec : suspicious macro
{
    meta:
        description = "Office document with auto-executing VBA macro"
        author = "FSODefender"
    strings:
        $autoopen = "AutoOpen" ascii wide nocase
        $document_open = "Document_Open" ascii wide nocase
        $shell = "WScript.Shell" ascii wide nocase
        $createobject = "CreateObject" ascii wide nocase
    condition:
        any of ($autoopen, $document_open) and any of ($shell, $createobject)
}
