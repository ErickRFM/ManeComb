package com.anonymous.combiscontrol.documents

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class ManeCombDocumentFileModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newSingleThreadExecutor()

  override fun getName() = "ManeCombDocumentFile"

  @ReactMethod
  fun downloadAndOpen(url: String, token: String, fileName: String, mimeType: String, promise: Promise) {
    executor.execute {
      try {
        val directory = File(context.cacheDir, "protected-documents").apply { mkdirs() }
        directory.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 3_600_000L }?.forEach { it.delete() }
        val safeName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_").take(120).ifBlank { "documento" }
        val destination = File(directory, "${System.nanoTime()}-$safeName")
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.setRequestProperty("Authorization", "Bearer $token")
        connection.connectTimeout = 20_000
        connection.readTimeout = 45_000
        try {
          if (connection.responseCode !in 200..299) throw IllegalStateException("download_failed_${connection.responseCode}")
          connection.inputStream.use { input -> destination.outputStream().use { output -> input.copyTo(output) } }
        } finally {
          connection.disconnect()
        }

        val intent = Intent(context, ManeCombDocumentViewerActivity::class.java).apply {
          putExtra(ManeCombDocumentViewerActivity.EXTRA_FILE_PATH, destination.absolutePath)
          putExtra(ManeCombDocumentViewerActivity.EXTRA_MIME_TYPE, mimeType)
          putExtra(ManeCombDocumentViewerActivity.EXTRA_DISPLAY_NAME, fileName)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        promise.resolve(null)
      } catch (_: Exception) {
        promise.reject("DOCUMENT_OPEN_FAILED", "No fue posible abrir el documento protegido dentro de ManeComb.")
      }
    }
  }
}
