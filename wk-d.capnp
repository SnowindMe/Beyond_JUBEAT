using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [
    (name = "d", disk = (path = "D:\\dsh_data\\wkt", writable = true)),
    (name = "main", worker = (
      compatibilityDate = "2025-09-24",
      modules = [ (name = "m.js", esModule = "export default {fetch(){return new Response('ok')}}") ],
      durableObjectNamespaces = [ (className = "E", uniqueKey = "mk-test", enableSql = true) ],
      durableObjectStorage = (localDisk = "d"),
      bindings = [ (name = "D", durableObjectNamespace = (className = "E")) ],
    )),
  ],
  sockets = [ (name="http", address="127.0.0.1:8899", http=(), service="main") ],
);
