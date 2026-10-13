{{- define "stockroom.labels" -}}
app.kubernetes.io/name: stockroom
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
