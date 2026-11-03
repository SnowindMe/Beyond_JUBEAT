using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [
    (name = "d", disk = (path = "miniflare-email-store", writable = true)),
    (name = "main", worker = (
      compatibilityDate = "2025-09-24",
      modules = [ (name = "m.js", esModule = "export default {fetch(){return new Response('ok')}}") ],
      bindings = [ (name = "D", service = (name = "d")) ],
    )),
  ],
  sockets = [ (name="http", address="127.0.0.1:8899", http=(), service="main") ],
);
