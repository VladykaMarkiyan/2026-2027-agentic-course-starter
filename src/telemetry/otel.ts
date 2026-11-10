/**
 * Експорт трас у Langfuse через OTLP/HTTP (крок 06).
 * Використовує офіційні пакети OpenTelemetry та AI SDK з підтримкою конвенцій GenAI.
 */
import { registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

let sdkInstance: NodeSDK | null = null;

export function initTelemetry(): NodeSDK {
  if (sdkInstance) return sdkInstance;

  const exporter = new OTLPTraceExporter({
    // Ендпоінт і заголовки читаються з OTEL_EXPORTER_OTLP_* автоматично
  });

  sdkInstance = new NodeSDK({
    traceExporter: exporter,
  });

  sdkInstance.start();

  // Реєстрація сучасної телеметрії AI SDK (не Legacy)
  registerTelemetry(
    new OpenTelemetry({
      // recordInputs та recordOutputs вимкнено для публічного репозиторію
    })
  );

  return sdkInstance;
}
