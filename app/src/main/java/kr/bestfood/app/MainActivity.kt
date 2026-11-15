package kr.bestfood.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
    private lateinit var web: WebView
    private var pendingFileChoice: ValueCallback<Array<Uri>>? = null
    private val filePickerRequestCode = 4102
    private val saveRequestCode = 4103
    private var pendingSave: ByteArray? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccessFromFileURLs = false
        web.settings.allowUniversalAccessFromFileURLs = false
        web.settings.javaScriptCanOpenWindowsAutomatically = false
        web.settings.setSupportMultipleWindows(false)
        web.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            web.settings.safeBrowsingEnabled = true
        }
        WebView.setWebContentsDebuggingEnabled(false)
        web.addJavascriptInterface(object {
            @JavascriptInterface
            fun saveText(name: String, mime: String, content: String) {
                val allowedNames = setOf("best-food-backup.json", "best-food-products.csv", "best-food-price-changes.csv")
                val expectedMime = if (name == "best-food-backup.json") "application/json" else "text/csv;charset=utf-8"
                if (name !in allowedNames || mime != expectedMime) return
                val bytes = content.toByteArray(Charsets.UTF_8)
                if (bytes.size > 2_000_000) return
                runOnUiThread {
                    if (pendingSave != null) {
                        Toast.makeText(this@MainActivity, "이전 파일 저장을 먼저 완료해 주세요.", Toast.LENGTH_SHORT).show()
                        return@runOnUiThread
                    }
                    pendingSave = bytes
                    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = if (mime == "application/json") "application/json" else "text/csv"
                        putExtra(Intent.EXTRA_TITLE, name)
                    }
                    try { startActivityForResult(intent, saveRequestCode) } catch (_: Exception) {
                        pendingSave = null
                        Toast.makeText(this@MainActivity, "파일 저장창을 열 수 없습니다.", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }, "AndroidFiles")
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: WebChromeClient.FileChooserParams?
            ): Boolean {
                pendingFileChoice?.onReceiveValue(null)
                pendingFileChoice = filePathCallback
                return try {
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "application/json"
                    }
                    startActivityForResult(intent, filePickerRequestCode)
                    true
                } catch (e: Exception) {
                    pendingFileChoice?.onReceiveValue(null)
                    pendingFileChoice = null
                    false
                }
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                val uri = request.url
                if (uri.scheme == "file" && uri.path == "/android_asset/index.html") return false
                if (uri.scheme == "https") {
                    openExternal(uri)
                }
                return true
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                val uri = url?.let(Uri::parse) ?: return true
                if (uri.scheme == "file" && uri.path == "/android_asset/index.html") return false
                if (uri.scheme == "https") openExternal(uri)
                return true
            }
        }
        setContentView(web)
        web.loadUrl("file:///android_asset/index.html")
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: Exception) {
            Toast.makeText(this, "링크를 열 수 없습니다.", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroy() {
        pendingFileChoice?.onReceiveValue(null)
        pendingFileChoice = null
        pendingSave = null
        web.removeJavascriptInterface("AndroidFiles")
        web.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == saveRequestCode) {
            val content = pendingSave
            pendingSave = null
            if (resultCode == RESULT_OK && content != null && data?.data != null) {
                try {
                    val stream = contentResolver.openOutputStream(data.data!!)
                        ?: throw IllegalStateException("Cannot open output stream")
                    stream.use { it.write(content) }
                    Toast.makeText(this, "파일 저장 완료", Toast.LENGTH_SHORT).show()
                } catch (_: Exception) {
                    Toast.makeText(this, "파일 저장에 실패했습니다.", Toast.LENGTH_LONG).show()
                }
            }
        }
        if (requestCode == filePickerRequestCode) {
            val chosen = if (resultCode == RESULT_OK) data?.data?.let { arrayOf(it) } else null
            pendingFileChoice?.onReceiveValue(chosen)
            pendingFileChoice = null
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
