using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [ (name = "main", worker = (
    compatibilityDate = "2025-09-24",
    modules = [ (name = "m.js", esModule = "export default {fetch(){return new Response('ok')}}") ],
  )) ],
  sockets = [ (name="http", address="127.0.0.1:8899", http=(), service="main") ],
);
