//! Windows DPAPI ile küçük sırların (karantina anahtarı) korunması.
//!
//! Anahtar yalnızca aynı Windows kullanıcısı tarafından çözülebilir. Ürün Windows'a
//! özgü olduğu için diğer platformlarda bu modül derlenebilir ama çağrılar hata döner.

use crate::error::{Error, Result};

const ENTROPY: &[u8] = b"FSODefender.v1.quarantine.key";

#[cfg(windows)]
pub fn protect(data: &[u8]) -> Result<Vec<u8>> {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData,
    };

    let mut input = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut entropy = CRYPT_INTEGER_BLOB {
        cbData: ENTROPY.len() as u32,
        pbData: ENTROPY.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };

    // SAFETY: Tüm işaretçiler çağrı süresince geçerli; çıktı tamponu DPAPI tarafından ayrılır
    // ve aşağıda LocalFree ile serbest bırakılır.
    let ok = unsafe {
        CryptProtectData(
            &input,
            std::ptr::null(),
            &entropy,
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err(Error::Dpapi(std::io::Error::last_os_error().to_string()));
    }
    if output.pbData.is_null() {
        return Err(Error::Dpapi("DPAPI boş çıktı döndürdü".to_string()));
    }

    // SAFETY: DPAPI, output.cbData baytlık geçerli bir tampon ayırdı.
    let slice = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) };
    let result = slice.to_vec();
    unsafe {
        LocalFree(output.pbData.cast());
    }
    // Girdi blokları yalnızca okunur; derleyiciye açık olsun.
    let _ = (&mut input, &mut entropy);
    Ok(result)
}

#[cfg(windows)]
pub fn unprotect(data: &[u8]) -> Result<Vec<u8>> {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptUnprotectData,
    };

    let mut input = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut entropy = CRYPT_INTEGER_BLOB {
        cbData: ENTROPY.len() as u32,
        pbData: ENTROPY.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };

    // SAFETY: Girdi ve entropi tamponları çağrı süresince geçerli; açıklama istenmiyor.
    let ok = unsafe {
        CryptUnprotectData(
            &input,
            std::ptr::null_mut(),
            &entropy,
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err(Error::Dpapi(std::io::Error::last_os_error().to_string()));
    }
    if output.pbData.is_null() {
        return Err(Error::Dpapi("DPAPI boş çıktı döndürdü".to_string()));
    }

    // SAFETY: DPAPI, output.cbData baytlık geçerli bir tampon ayırdı.
    let slice = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) };
    let result = slice.to_vec();
    unsafe {
        LocalFree(output.pbData.cast());
    }
    let _ = (&mut input, &mut entropy);
    Ok(result)
}

#[cfg(not(windows))]
pub fn protect(_data: &[u8]) -> Result<Vec<u8>> {
    Err(Error::Dpapi(
        "DPAPI yalnızca Windows'ta kullanılabilir".to_string(),
    ))
}

#[cfg(not(windows))]
pub fn unprotect(_data: &[u8]) -> Result<Vec<u8>> {
    Err(Error::Dpapi(
        "DPAPI yalnızca Windows'ta kullanılabilir".to_string(),
    ))
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn protect_unprotect_roundtrip() {
        let secret = b"fsodefender-quarantine-key-32-byte";
        let protected = protect(secret).unwrap();
        assert_ne!(protected, secret);
        let restored = unprotect(&protected).unwrap();
        assert_eq!(restored, secret);
    }

    #[test]
    fn tampered_blob_is_rejected() {
        let mut protected = protect(b"secret").unwrap();
        let last = protected.len() - 1;
        protected[last] ^= 0xFF;
        assert!(unprotect(&protected).is_err());
    }
}
