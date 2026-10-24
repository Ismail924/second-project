package app.rivaya.next;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

final class SessionVault {
    private static final String ALIAS="rivaya.session.v1";
    private static SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(ALIAS))return (SecretKey)store.getKey(ALIAS,null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    static synchronized String request(Context context,String text){
        JSONObject response=new JSONObject();
        try{
            if(text==null||text.length()>20000)throw new Exception();
            JSONObject body=new JSONObject(text);String id=body.getString("requestId"),op=body.getString("operation");
            if(id.length()>100)throw new Exception();response.put("requestId",id);
            android.content.SharedPreferences prefs=context.getSharedPreferences("rivaya_secure_session",Context.MODE_PRIVATE);
            if(op.equals("write")){
                String value=body.getString("value");if(value.length()>16384)throw new Exception();new JSONObject(value);
                Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
                String encoded=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
                if(!prefs.edit().putString("session",encoded).commit())throw new Exception();
            }else if(op.equals("read")){
                String value=prefs.getString("session",null);
                if(value!=null){String[] parts=value.split(":");if(parts.length!=2)throw new Exception();Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));response.put("value",new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8));}
            }else if(op.equals("clear")){if(!prefs.edit().remove("session").commit())throw new Exception();}
            else throw new Exception();
        }catch(Exception error){try{response.put("error","secure_storage_failed");}catch(Exception ignored){}}
        return response.toString();
    }
}
