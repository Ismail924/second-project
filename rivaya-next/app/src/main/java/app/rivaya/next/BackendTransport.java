package app.rivaya.next;
import org.json.JSONObject;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

final class BackendTransport {
    private static final ExecutorService queue=Executors.newFixedThreadPool(3);
    interface Callback { void done(String result); }
    static void request(String text,Callback callback){
        queue.execute(()->{
            JSONObject result=new JSONObject();HttpsURLConnection connection=null;
            try{
                if(text==null||text.length()>5_000_000)throw new Exception();
                JSONObject data=new JSONObject(text);String id=data.getString("requestId");if(id.length()>100)throw new Exception();result.put("requestId",id);
                URL url=new URL(data.getString("url"));String path=url.getPath(),method=data.getString("method");
                if(!url.getProtocol().equals("https")||!url.getHost().equals("uerhkthubarwrikjtxul.supabase.co")||url.getUserInfo()!=null||(url.getPort()!=-1&&url.getPort()!=443)||!(path.startsWith("/auth/v1/")||path.startsWith("/rest/v1/")||path.startsWith("/functions/v1/"))||!java.util.Arrays.asList("GET","POST","PUT","PATCH","DELETE").contains(method))throw new Exception();
                connection=(HttpsURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(15000);connection.setRequestMethod(method);
                JSONObject headers=data.optJSONObject("headers");if(headers!=null){java.util.Iterator<String> keys=headers.keys();while(keys.hasNext()){String key=keys.next();if(java.util.Arrays.asList("authorization","apikey","content-type").contains(key.toLowerCase(java.util.Locale.US)))connection.setRequestProperty(key,headers.getString(key));}}
                if(!data.isNull("body")){connection.setDoOutput(true);try(java.io.OutputStream out=connection.getOutputStream()){out.write(data.getString("body").getBytes(StandardCharsets.UTF_8));}}
                int status=connection.getResponseCode();ByteArrayOutputStream bytes=new ByteArrayOutputStream();
                InputStream stream=status>=400?connection.getErrorStream():connection.getInputStream();
                if(stream!=null)try(InputStream input=stream){byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1){if(bytes.size()+n>5_000_000)throw new Exception();bytes.write(buffer,0,n);}}
                result.put("status",status);result.put("body",bytes.toString("UTF-8"));
            }catch(Exception error){try{result.put("error",true);}catch(Exception ignored){}}
            finally{if(connection!=null)connection.disconnect();}
            callback.done(result.toString());
        });
    }
}
