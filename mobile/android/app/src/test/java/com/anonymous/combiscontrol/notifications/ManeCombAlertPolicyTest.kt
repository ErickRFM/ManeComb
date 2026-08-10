package com.anonymous.combiscontrol.notifications

import com.anonymous.combiscontrol.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ManeCombAlertPolicyTest {

  @Before
  fun setUp() {
    ManeCombAlertPolicy.resetDedupForTests()
  }

  // --- Politica: la gravedad la decide backend --------------------------------

  @Test
  fun `critical va al canal SOS versionado`() {
    val feedback = ManeCombAlertPolicy.resolve("sos", "critical", "critical")
    assertEquals(ManeCombAlertPolicy.CHANNEL_SOS, feedback?.channelId)
    assertEquals("operacion-sos-v2", feedback?.channelId)
    assertEquals(R.raw.alert_sos, feedback?.soundResource)
  }

  @Test
  fun `warning va al canal de alta prioridad`() {
    val feedback = ManeCombAlertPolicy.resolve("incident", "warning", "high")
    assertEquals("operacion-incidentes-alta-v2", feedback?.channelId)
    assertEquals(R.raw.alert_high, feedback?.soundResource)
  }

  @Test
  fun `info va al canal de incidencias estandar`() {
    val feedback = ManeCombAlertPolicy.resolve("incident", "info", "low")
    assertEquals("operacion-incidentes-v2", feedback?.channelId)
    assertEquals(R.raw.alert_standard, feedback?.soundResource)
  }

  @Test
  fun `category sos manda aunque el level llegue en blanco`() {
    val feedback = ManeCombAlertPolicy.resolve("sos", "")
    assertEquals(ManeCombAlertPolicy.CHANNEL_SOS, feedback?.channelId)
  }

  @Test
  fun `no reinterpreta severity cuando backend ya resolvio level`() {
    // severity=critical pero backend dijo info: manda backend.
    val feedback = ManeCombAlertPolicy.resolve("incident", "info", "critical")
    assertEquals("operacion-incidentes-v2", feedback?.channelId)
  }

  @Test
  fun `solo cae en severity con payload legado sin level`() {
    assertEquals(
      ManeCombAlertPolicy.CHANNEL_SOS,
      ManeCombAlertPolicy.resolve("incident", null, "critical")?.channelId
    )
    assertEquals(
      "operacion-incidentes-alta-v2",
      ManeCombAlertPolicy.resolve("incident", null, "high")?.channelId
    )
  }

  // --- Enrutado: nunca chat, nunca llamadas -----------------------------------

  @Test
  fun `chat y llamadas no son alertas operativas`() {
    assertNull(ManeCombAlertPolicy.resolve("chat", "info"))
    assertNull(ManeCombAlertPolicy.resolve("call", "critical"))
    assertFalse(ManeCombAlertPolicy.isOperationalAlert("chat"))
    assertFalse(ManeCombAlertPolicy.isOperationalAlert("call"))
    assertFalse(ManeCombAlertPolicy.isOperationalAlert(null))
  }

  @Test
  fun `ningun canal de alerta reutiliza chat ni llamadas`() {
    val alertChannels = listOf(
      ManeCombAlertPolicy.CHANNEL_SOS,
      ManeCombAlertPolicy.CHANNEL_HIGH,
      ManeCombAlertPolicy.CHANNEL_STANDARD
    )
    assertFalse(alertChannels.contains(ManeCombPushNotificationRenderer.CHANNEL_CHAT))
    assertFalse(alertChannels.contains(ManeCombPushNotificationRenderer.CHANNEL_CALLS))
  }

  @Test
  fun `los canales van versionados para no heredar ajustes inmutables`() {
    // Un canal ya creado no cambia de sonido: los ids v2 son la unica via para
    // que una instalacion previa reciba el patron nuevo.
    listOf(
      ManeCombAlertPolicy.CHANNEL_SOS,
      ManeCombAlertPolicy.CHANNEL_HIGH,
      ManeCombAlertPolicy.CHANNEL_STANDARD
    ).forEach { assertTrue(it.endsWith("-v2")) }
  }

  // --- Identidad ---------------------------------------------------------------

  @Test
  fun `la identidad sale del incidentId y no del titulo`() {
    val a = ManeCombAlertPolicy.notificationIdFor("inc-a", "Accidente")
    val b = ManeCombAlertPolicy.notificationIdFor("inc-b", "Accidente")
    assertNotEquals(a, b)

    val repeated = ManeCombAlertPolicy.notificationIdFor("inc-a", "otro titulo")
    assertEquals(a, repeated)
  }

  // --- Dedup compartido ---------------------------------------------------------

  @Test
  fun `socket y push del mismo incidente producen una sola alerta`() {
    val now = 1_000_000L
    assertTrue(ManeCombAlertPolicy.shouldEmitAlert("inc-1", now))
    assertFalse(ManeCombAlertPolicy.shouldEmitAlert("inc-1", now + 250))
    assertFalse(ManeCombAlertPolicy.shouldEmitAlert("inc-1", now + 3_000))
  }

  @Test
  fun `incidencias distintas nunca se deduplican entre si`() {
    val now = 2_000_000L
    assertTrue(ManeCombAlertPolicy.shouldEmitAlert("inc-a", now))
    assertTrue(ManeCombAlertPolicy.shouldEmitAlert("inc-b", now + 10))
    assertTrue(ManeCombAlertPolicy.shouldEmitAlert("inc-c", now + 20))
  }

  @Test
  fun `la ventana de dedup expira`() {
    val now = 3_000_000L
    assertTrue(ManeCombAlertPolicy.shouldEmitAlert("inc-x", now))
    assertFalse(ManeCombAlertPolicy.shouldEmitAlert("inc-x", now + ManeCombAlertPolicy.DEDUP_WINDOW_MS - 1))
    assertTrue(ManeCombAlertPolicy.shouldEmitAlert("inc-x", now + ManeCombAlertPolicy.DEDUP_WINDOW_MS))
  }

  @Test
  fun `una clave vacia nunca bloquea otras alertas`() {
    val now = 4_000_000L
    assertTrue(ManeCombAlertPolicy.shouldEmitAlert("", now))
    assertTrue(ManeCombAlertPolicy.shouldEmitAlert("", now + 1))
    assertTrue(ManeCombAlertPolicy.shouldEmitAlert("inc-real", now + 2))
  }
}
