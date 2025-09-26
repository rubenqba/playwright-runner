import { RecordingEvent, TestRecording } from '@cmx-replayer/shared';

export function toPlaywrightSelector(sel: string): string {
  return sel
    .replace(/\s*>\s*/g, ' ') // opcional: normaliza ' > ' a espacio
    .replace(/::shadow/g, ' >> internal:shadow ');
}

function renderEvent(ev: RecordingEvent): string {
  const sel = toPlaywrightSelector(ev.event_selector);

  switch (ev.type) {
    case 'click':
      // Preferimos selector; si quisieras fallback a coordenadas:
      // const coord = ev.event_location ? `, /*fallback*/ // page.mouse.click(${ev.event_location.x}, ${ev.event_location.y})` : '';
      return `await page.locator(${JSON.stringify(sel)}).click();`;

    case 'change': {
      // Tu recorder mete el value en event_data.value (catchall)
      const value = (ev.event_data as any)?.value ?? '';
      return `await page.locator(${JSON.stringify(sel)}).fill(${JSON.stringify(String(value))});`;
    }
  }

  // Silencioso por ahora; o loggea para depurar
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  return `// TODO: unsupported event type: ${ev.type}`;
}

export function generatePlaywrightSpec(tr: TestRecording): string {
  const lines: string[] = [];
  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push('');
  lines.push(`test.describe(${JSON.stringify(tr.name)}, () => {`);

  for (const rec of tr.recordings) {
    const title = `${tr.category} #${rec.id}`;
    lines.push(`  test(${JSON.stringify(title)}, async ({ page }) => {`);
    lines.push(`    await page.goto(${JSON.stringify(rec.url)});`);

    for (const ev of rec.events) {
      // Si detectas valores sensibles, cámbialos por env vars:
      if (ev.type === 'change') {
        const isUser = /user|email|login/i.test(ev.event_data?.description ?? '');
        const isPass = /pass|pwd|password/i.test(ev.event_data?.description ?? '');

        if (isUser || isPass) {
          const sel = toPlaywrightSelector(ev.event_selector);
          const env = isUser ? 'TEST_USERNAME' : 'TEST_PASSWORD';
          lines.push(`    await page.locator(${JSON.stringify(sel)}).fill(process.env.${env} ?? 'REDACTED');`);
          continue;
        }
      }
      lines.push(`    ${renderEvent(ev)}`);
    }

    // (Opcional) Assert de sanidad post flujo (personaliza por ruta/pantalla)
    // lines.push(`    await expect(page).toHaveURL(/app/);`);

    lines.push(`  });`);
    lines.push('');
  }

  lines.push(`});`);
  return lines.join('\n');
}
