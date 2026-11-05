rule ETH_Ransomware_Renommage_Masse
{
    meta:
        description = "Détecte un binaire qui parcourt les disques et renomme en masse, comportement commun aux groupes suivis"
        author = "ALPHATECH SENTINEL"
        severity = "critical"
    strings:
        $a1 = "FindFirstFileW" ascii
        $a2 = "MoveFileExW" ascii
        $a3 = "CryptEncrypt" ascii
        $ext1 = ".locked" ascii nocase
        $ext2 = ".encrypted" ascii nocase
        $ext3 = ".README" ascii nocase
        $note = "your files" ascii nocase
    condition:
        (2 of ($a*)) and (2 of ($ext*)) or $note
}

rule ETH_Mimikatz_Famille
{
    meta:
        description = "Détecte Mimikatz et ses variantes compilées (medusalocker, incransom, play)"
        author = "ALPHATECH SENTINEL"
        severity = "critical"
    strings:
        $s1 = "sekurlsa::logonpasswords" ascii wide
        $s2 = "lsadump::sam" ascii wide
        $s3 = "kerberos::golden" ascii wide
        $s4 = "gentilkiwi" ascii nocase
    condition:
        any of them
}

rule ETH_EDRKill_Pilote
{
    meta:
        description = "Détecte le chargeur de pilote utilisé pour neutraliser les antivirus"
        author = "ALPHATECH SENTINEL"
        severity = "high"
    strings:
        $d1 = "echo_driver" ascii wide
        $d2 = "\\\\.\\Nal" ascii
        $d3 = "ZwUnloadDriver" ascii
        $k1 = "\\Device\\PhysicalMemory" ascii wide
    condition:
        2 of them
}
