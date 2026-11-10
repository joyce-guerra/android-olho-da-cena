// Role: adapter
package br.com.olhodacena

import android.content.Context
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.File
import java.io.FileInputStream

/**
 * Intercepta requisições `app://olho/` dentro do WebView do Android para servir
 * mídias locais (`app://olho/arquivo?p=...`) e assets empacotados (`ui/`, `src/`, `vendor/`)
 * com suporte aos cabeçalhos de streaming exigidos pelos players de áudio e vídeo.
 */
class OlhoAssetLoaderAdapter(private val context: Context) {

    fun interceptar(request: WebResourceRequest): WebResourceResponse? {
        val url = request.url ?: return null
        if (url.scheme != "app" || url.host != "olho") return null

        val path = url.path ?: "/"
        if (path == "/arquivo") {
            val arquivoParam = url.getQueryParameter("p") ?: return null
            val file = File(Uri.decode(arquivoParam))
            if (!file.exists() || !file.isFile) return null
            val mime = inferirMime(file.name)
            return WebResourceResponse(
                mime,
                "UTF-8",
                200,
                "OK",
                mapOf("Accept-Ranges" to "bytes", "Access-Control-Allow-Origin" to "*"),
                FileInputStream(file)
            )
        }

        val assetPath = path.removePrefix("/").ifEmpty { "ui/index.html" }
        return try {
            val stream = context.assets.open(assetPath)
            WebResourceResponse(
                inferirMime(assetPath),
                "UTF-8",
                200,
                "OK",
                mapOf("Access-Control-Allow-Origin" to "*"),
                stream
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun inferirMime(nome: String): String {
        val n = nome.lowercase()
        return when {
            n.endsWith(".html") -> "text/html"
            n.endsWith(".js") || n.endsWith(".cjs") -> "application/javascript"
            n.endsWith(".css") -> "text/css"
            n.endsWith(".json") -> "application/json"
            n.endsWith(".wasm") -> "application/wasm"
            n.endsWith(".mp4") -> "video/mp4"
            n.endsWith(".webm") -> "video/webm"
            n.endsWith(".mp3") -> "audio/mpeg"
            n.endsWith(".wav") -> "audio/wav"
            n.endsWith(".jpg") || n.endsWith(".jpeg") -> "image/jpeg"
            n.endsWith(".png") -> "image/png"
            else -> "application/octet-stream"
        }
    }
}
