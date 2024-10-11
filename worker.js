// we don't connect worker to our server, so we need secure way to transport data between server and worker
const KEY = '12345678901234567890123456789012'; // random AES key, must be 32 bytes
async function AES_CBC_Decrypt(encryptedData) {
  try {
    const decodedData = atob(encryptedData); // base64 -> IV(16bytes) + Cipher(?bytes) -> plain
    const iv = new Uint8Array(decodedData.slice(0, 16).split("").map(c => c.charCodeAt(0)));
    const encryptedBytes = new Uint8Array(decodedData.slice(16).split("").map(c => c.charCodeAt(0)));
    const keyBytes = new TextEncoder().encode(KEY);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', 
      keyBytes, 
      { name: 'AES-CBC' }, 
      false, 
      ['decrypt']
    );
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: iv },
      cryptoKey,
      encryptedBytes
    );
    return new TextDecoder().decode(decryptedData);
  }
  catch(e)
  {
    return null;
  }
}

// just shit wrapper
function generate_exit_msg(code, msg)
{
  return new Response(JSON.stringify({"code": code, "msg": msg}));
}

export default {
  async fetch(request, env) {
    const income_url = new URL(request.url);
    const params = new URLSearchParams(income_url.search);
    const cipher = params.get('param');
    if(!cipher)
    {
      return generate_exit_msg(1, "invalid parameter");
    }
    let plain = await AES_CBC_Decrypt(cipher);
    if(!plain)
    {
      return generate_exit_msg(1, "invalid parameter");
    }
    const Data = JSON.parse(plain);
	
	// check expire time so people dont abuse
    const CurrentTime = Math.floor(Date.now() / 1000);
    if (Data.Expire < CurrentTime)
    {
      return generate_exit_msg(2, "link expired");
    }
    
	// assetUrl
    const DownloadUrl = new URL(Data.Url);

	// convert php curl header to js header
    const RequestHeaders = Data.Headers.reduce((acc, header) => {
        const [key, value] = header.split(': ').map(str => str.trim());
        acc[key] = value;
        return acc;
    }, {});
    
	// set cookie
    RequestHeaders.cookie = Data.Cookie;
    
    const VRCResponse = await fetch(DownloadUrl, {
      headers: RequestHeaders,
      method: 'GET',
      redirect: 'follow'
    });

    //console.log(DownloadUrl, Headers, VRCResponse);
    if(VRCResponse.status == 403)
    {
      return new Response("this avatar can not be download.");
    }
	
	// set filename so user doesnt download void
    const ReturnHeaders = new Headers(VRCResponse.headers);
    ReturnHeaders.set('Content-Disposition', 'attachment; filename="' + Data.FileName + '"');
    const DownloadResponse = new Response(VRCResponse.body, {
      status: VRCResponse.status,
      statusText: VRCResponse.statusText,
      headers: ReturnHeaders,
    })
  
    return DownloadResponse;
  }
}