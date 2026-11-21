import { t } from "elysia" 

export const ProcessURLSchema = t.Object({
    url: t.String()
})

export const ProcessTextSchema = t.Object({
    text: t.String()
})

export const ProcessVideoSchema = t.Object({
    video: t.String()
})

export const ProcessImageSchema = t.Object({
    image: t.String()
})