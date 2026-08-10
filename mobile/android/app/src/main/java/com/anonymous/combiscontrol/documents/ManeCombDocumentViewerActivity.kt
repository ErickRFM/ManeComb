package com.anonymous.combiscontrol.documents

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.pdf.PdfRenderer
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.io.File

class ManeCombDocumentViewerActivity : Activity() {
  private val renderedBitmaps = mutableListOf<Bitmap>()

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val filePath = intent.getStringExtra(EXTRA_FILE_PATH).orEmpty()
    val mimeType = intent.getStringExtra(EXTRA_MIME_TYPE).orEmpty().lowercase()
    val displayName = intent.getStringExtra(EXTRA_DISPLAY_NAME).orEmpty().ifBlank { "Documento" }
    val file = File(filePath)

    window.statusBarColor = BACKGROUND
    window.navigationBarColor = BACKGROUND

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(BACKGROUND)
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    }

    root.addView(buildToolbar(displayName))

    val scroll = ScrollView(this).apply {
      isFillViewport = true
      setBackgroundColor(BACKGROUND)
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        0,
        1f
      )
    }
    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(12), dp(12), dp(12), dp(28))
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      )
    }
    scroll.addView(content)
    root.addView(scroll)
    setContentView(root)

    if (!file.exists() || !file.isFile) {
      showError(content, "El archivo protegido ya no está disponible.")
      return
    }

    try {
      if (mimeType == "application/pdf" || file.extension.equals("pdf", ignoreCase = true)) {
        renderPdf(file, content)
      } else if (mimeType.startsWith("image/") || isSupportedImage(file.extension)) {
        renderImage(file, content)
      } else {
        showError(content, "Este tipo de documento todavía no puede mostrarse dentro de ManeComb.")
      }
    } catch (_: Exception) {
      showError(content, "No fue posible mostrar el documento protegido.")
    }
  }

  override fun onDestroy() {
    renderedBitmaps.forEach { bitmap ->
      if (!bitmap.isRecycled) bitmap.recycle()
    }
    renderedBitmaps.clear()
    super.onDestroy()
  }

  private fun buildToolbar(displayName: String): View {
    val toolbar = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(8), dp(8), dp(12), dp(8))
      setBackgroundColor(SURFACE)
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        dp(60)
      )
    }

    val back = TextView(this).apply {
      text = "‹"
      textSize = 38f
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      contentDescription = "Volver"
      setOnClickListener { finish() }
      layoutParams = LinearLayout.LayoutParams(dp(48), ViewGroup.LayoutParams.MATCH_PARENT)
    }

    val title = TextView(this).apply {
      text = displayName
      textSize = 16f
      setTextColor(Color.WHITE)
      setTypeface(typeface, Typeface.BOLD)
      maxLines = 2
      layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
    }

    val protectedLabel = TextView(this).apply {
      text = "PROTEGIDO"
      textSize = 10f
      setTextColor(ACCENT)
      setTypeface(typeface, Typeface.BOLD)
      gravity = Gravity.CENTER
      setPadding(dp(8), dp(5), dp(8), dp(5))
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      )
    }

    toolbar.addView(back)
    toolbar.addView(title)
    toolbar.addView(protectedLabel)
    return toolbar
  }

  private fun renderImage(file: File, content: LinearLayout) {
    val bitmap = BitmapFactory.decodeFile(file.absolutePath)
      ?: throw IllegalStateException("image_decode_failed")
    renderedBitmaps.add(bitmap)

    val image = ImageView(this).apply {
      setImageBitmap(bitmap)
      adjustViewBounds = true
      scaleType = ImageView.ScaleType.FIT_CENTER
      contentDescription = "Documento ${file.name}"
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      )
    }
    content.addView(image)
  }

  private fun renderPdf(file: File, content: LinearLayout) {
    val descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    val renderer = PdfRenderer(descriptor)
    try {
      if (renderer.pageCount == 0) {
        showError(content, "El PDF no contiene páginas visibles.")
        return
      }

      val targetWidth = (resources.displayMetrics.widthPixels - dp(24)).coerceAtLeast(1)
      for (index in 0 until renderer.pageCount) {
        val page = renderer.openPage(index)
        try {
          val targetHeight = (targetWidth.toFloat() * page.height.toFloat() / page.width.toFloat())
            .toInt()
            .coerceAtLeast(1)
          val bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
          bitmap.eraseColor(Color.WHITE)
          page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
          renderedBitmaps.add(bitmap)

          val image = ImageView(this).apply {
            setImageBitmap(bitmap)
            adjustViewBounds = true
            scaleType = ImageView.ScaleType.FIT_CENTER
            contentDescription = "Página ${index + 1}"
            setBackgroundColor(Color.WHITE)
            layoutParams = LinearLayout.LayoutParams(
              ViewGroup.LayoutParams.MATCH_PARENT,
              ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
              bottomMargin = dp(12)
            }
          }
          content.addView(image)
        } finally {
          page.close()
        }
      }
    } finally {
      renderer.close()
      descriptor.close()
    }
  }

  private fun showError(content: LinearLayout, message: String) {
    content.removeAllViews()
    content.gravity = Gravity.CENTER
    content.addView(TextView(this).apply {
      text = message
      textSize = 15f
      gravity = Gravity.CENTER
      setTextColor(Color.LTGRAY)
      setPadding(dp(24), dp(48), dp(24), dp(48))
    })
  }

  private fun isSupportedImage(extension: String): Boolean {
    return extension.lowercase() in setOf("jpg", "jpeg", "png", "webp")
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }

  companion object {
    const val EXTRA_FILE_PATH = "filePath"
    const val EXTRA_MIME_TYPE = "mimeType"
    const val EXTRA_DISPLAY_NAME = "displayName"

    private val BACKGROUND = Color.rgb(9, 11, 16)
    private val SURFACE = Color.rgb(19, 23, 31)
    private val ACCENT = Color.rgb(227, 30, 36)
  }
}
