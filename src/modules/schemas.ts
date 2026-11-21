import { t } from "elysia" 

const Base64Schema = t.String({
  format: 'byte',
  pattern: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$',
  minLength: 4,
  maxLength: 8_000_000,
  error: 'musi być poprawnym ciągiem Base64'
})

const HttpURLSchema = t.String({
  format: 'url',
  pattern: '^https?://',
  maxLength: 2048,
  error: 'musi być prawidłowym adresem URL zaczynającym się od http:// lub https://'
})

export const ProcessURLSchema = t.Object({
  url: HttpURLSchema
})

export const ProcessTextSchema = t.Object({
    text: t.String({ minLength: 1, maxLength: 100_000 })
})

export const ProcessVideoSchema = t.Object({
    video: HttpURLSchema
})

export const ProcessImageSchema = t.Object({
  image: Base64Schema
})