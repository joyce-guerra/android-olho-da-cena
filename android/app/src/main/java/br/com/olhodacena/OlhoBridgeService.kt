// Role: service
package br.com.olhodacena

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.webkit.JavascriptInterface
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Serviço exposto via `@JavascriptInterface` (`window.OlhoAndroidNativo`) para conectar
 * `src/android-nativo-adapter.js` ao armazenamento `Documentos/Olho da Cena`, Galeria (`MediaStore`),
 * área de transferência, lixeira e seletor de compartilhamento nativo do Android.
 */
class OlhoBridgeService(private val context: Context) {

    private val prefs = context.getSharedPreferences("olho_da_cena_cfg", Context.MODE_PRIVATE)

    @JavascriptInterface
    fun obterInfoDispositivoJson(): String {
        val docs = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
        val pastaBase = File(docs, "Olho da Cena").absolutePath
        val json = JSONObject()
        json.put("plataforma", "android")
        json.put("pastaBase", pastaBase)
        json.put("sdkInt", Build.VERSION.SDK_INT)
        json.put("suportaAudioInterno", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
        json.put("suportaLixeiraMediaStore", Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
        return json.toString()
    }

    @JavascriptInterface
    fun lerConfigJson(): String {
        return prefs.getString("config_json", "{}") ?: "{}"
    }

    @JavascriptInterface
    fun salvarConfigJson(novoJson: String) {
        prefs.edit().putString("config_json", novoJson).apply()
    }

    @JavascriptInterface
    fun indexarNoMediaStore(caminhoCompleto: String, tipoMime: String): String {
        val arq = File(caminhoCompleto)
        if (!arq.exists()) return ""
        MediaScannerConnection.scanFile(
            context,
            arrayOf(arq.absolutePath),
            arrayOf(tipoMime),
            null
        )
        return arq.absolutePath
    }

    @JavascriptInterface
    fun lerAreaTransferencia(): String {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        val item = cm?.primaryClip?.getItemAt(0)
        return item?.coerceToText(context)?.toString() ?: ""
    }

    @JavascriptInterface
    fun escreverAreaTransferencia(texto: String) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        cm?.setPrimaryClip(ClipData.newPlainText("Olho da Cena", texto))
    }

    @JavascriptInterface
    fun descartarMidiaJson(payloadJson: String): String {
        val obj = JSONObject(payloadJson)
        val acao = obj.optString("acao", "pasta-lixeira-local")
        val caminho = obj.optString("arquivo", "")
        val pastaDestino = obj.optString("pastaDestino", "")
        val origem = File(caminho)
        if (!origem.exists()) return acao

        if (acao == "apagar-permanente") {
            origem.delete()
            return acao
        }
        val dirLixeira = if (pastaDestino.isNotEmpty()) {
            File(pastaDestino)
        } else {
            File(origem.parentFile, ".lixeira")
        }
        if (!dirLixeira.exists()) dirLixeira.mkdirs()
        val destino = File(dirLixeira, origem.name)
        origem.renameTo(destino)
        return acao
    }

    @JavascriptInterface
    fun compartilharArquivosJson(payloadJson: String) {
        val obj = JSONObject(payloadJson)
        val arr = obj.optJSONArray("arquivos") ?: JSONArray()
        val titulo = obj.optString("titulo", "Compartilhar")
        val texto = obj.optString("texto", "")
        val uris = ArrayList<android.net.Uri>()

        for (i in 0 until arr.length()) {
            val f = File(arr.optString(i))
            if (f.exists()) {
                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    f
                )
                uris.add(uri)
            }
        }
        if (uris.isEmpty()) return

        val intent = if (uris.size == 1) {
            Intent(Intent.ACTION_SEND).apply {
                type = "*/*"
                putExtra(Intent.EXTRA_STREAM, uris[0])
                if (texto.isNotEmpty()) putExtra(Intent.EXTRA_TEXT, texto)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        } else {
            Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                type = "*/*"
                putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                if (texto.isNotEmpty()) putExtra(Intent.EXTRA_TEXT, texto)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        }
        val chooser = Intent.createChooser(intent, titulo).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }
}
