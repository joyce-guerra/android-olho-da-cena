// Role: controller
package br.com.olhodacena

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.media.AudioManager
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Controlador principal da janela Android do Olho da Cena.
 * Hospeda a interface acessível em WebView com suporte ao TalkBack e teclado físico,
 * intercepta o botão Voltar do Android (equivalente ao Escape nas árvores de seleção)
 * e escuta mudanças de foco de áudio para proteger gravações em andamento.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var assetLoader: OlhoAssetLoaderAdapter
    private lateinit var bridgeService: OlhoBridgeService
    private var audioManager: AudioManager? = null

    private val audioFocusListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                notificarEventoInterrupcao("perda-foco-transiente")
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                notificarEventoInterrupcao("retorno-foco")
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        assetLoader = OlhoAssetLoaderAdapter(this)
        bridgeService = OlhoBridgeService(this)
        audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.allowFileAccess = true

            addJavascriptInterface(bridgeService, "OlhoAndroidNativo")

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView?,
                    request: WebResourceRequest?
                ): WebResourceResponse? {
                    if (request == null) return null
                    return assetLoader.interceptar(request) ?: super.shouldInterceptRequest(view, request)
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest?) {
                    request?.grant(request.resources)
                }
            }
        }

        setContentView(webView)
        webView.loadUrl("app://olho/ui/index.html")
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            webView.evaluateJavascript(
                "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));",
                null
            )
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun notificarEventoInterrupcao(tipo: String) {
        runOnUiThread {
            webView.evaluateJavascript(
                "if (window.OlhoAoInterromperSistema) window.OlhoAoInterromperSistema('$tipo');",
                null
            )
        }
    }
}
