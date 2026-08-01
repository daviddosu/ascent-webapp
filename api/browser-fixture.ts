type FixtureRequest = {
  method?: string
}

type FixtureResponse = {
  setHeader(name: string, value: string): void
  status(code: number): FixtureResponse
  send(body: string): void
}

const page = (body: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ShotCount browser execution check</title>
    <style>
      body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 48px 20px; color: #171717; background: #f7f7f7; }
      main { max-width: 560px; margin: 0 auto; padding: 32px; border: 1px solid #ddd; border-radius: 18px; background: #fff; }
      label { display: grid; gap: 8px; margin: 18px 0; font-weight: 600; }
      input, textarea, button { font: inherit; }
      input, textarea { padding: 12px; border: 1px solid #bbb; border-radius: 10px; }
      textarea { min-height: 100px; resize: vertical; }
      button { padding: 12px 18px; border: 0; border-radius: 999px; color: #fff; background: #171717; cursor: pointer; }
    </style>
  </head>
  <body><main>${body}</main></body>
</html>`

export default function handler(request: FixtureRequest, response: FixtureResponse) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'text/html; charset=utf-8')

  if (request.method === 'GET') {
    response.status(200).send(page(`
      <h1>Controlled public form</h1>
      <p>This form is a non-persistent ShotCount browser execution check.</p>
      <form method="post" action="/api/browser-fixture">
        <label>Customer name<input name="customer_name" autocomplete="off" required></label>
        <label>Comments<textarea name="comments" required></textarea></label>
        <label>CV document<input type="file" name="cv_document" accept=".docx,.pdf" required></label>
        <label>Motivation statement<input type="file" name="motivation_document" accept=".docx,.pdf" required></label>
        <label><input type="checkbox" name="review_confirmed"> I will review all information before submitting</label>
        <p id="upload-status" aria-live="polite"></p>
        <script>
          document.querySelectorAll('input[type=file]').forEach(input => input.addEventListener('change', () => {
            document.querySelector('#upload-status').textContent = [...document.querySelectorAll('input[type=file]')]
              .map(item => item.files[0]?.name).filter(Boolean).join(', ') + ' ready'
          }))
        </script>
        <button type="submit">Submit form</button>
      </form>
    `))
    return
  }

  if (request.method === 'POST') {
    response.status(200).send(page(`
      <h1>Submission confirmed</h1>
      <p>The controlled form was submitted once. No submitted values were stored.</p>
    `))
    return
  }

  response.status(405).send(page('<h1>Method not allowed</h1>'))
}
