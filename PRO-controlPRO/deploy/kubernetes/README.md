# Despliegue Kubernetes opcional

Esta carpeta convierte la semilla en una app estática servida por Nginx con réplicas, rolling update, probes y HPA.

Pasos base:

```bash
docker build -t ghcr.io/tu-organizacion/semilla-appweb-pwa:latest .
docker push ghcr.io/tu-organizacion/semilla-appweb-pwa:latest
kubectl apply -f deploy/kubernetes/deployment.yaml
kubectl apply -f deploy/kubernetes/service.yaml
kubectl apply -f deploy/kubernetes/hpa.yaml
```

Cambia la imagen antes de aplicar. Para internet público agrega tu Ingress, Gateway o Load Balancer según tu proveedor.
