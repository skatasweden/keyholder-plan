❯ Gör research på hur loveable gör så   
att avändare kan bygga kod utan att     
skada deras server, de får egen         
supabase och egen server för koden?     
                                        
⏺ Jag researchar hur Lovable hanterar   
  isolation och infrastruktur åt sina   
  användare.                            
                                      
⏺ Agent(Research Lovable architecture)  
  ⎿  Done (27 tool uses · 38.9k         
  (ctrl+o to expand)                    
                                        
⏺ Hur Lovable isolerar användare        
                                        
  1. Kod-exekvering: Fly.io +           
  Firecracker MicroVMs                  
                                        
  Lovable kör inte kod i användarens    
  webbläsare (som Bolt.new med          
  WebContainers). Istället:             
                                        
  - Varje projekt får en egen           
  Firecracker MicroVM på Fly.io (samma  
  teknik som AWS Lambda)                
  - De har 4 000+ aktiva instanser igång
  - MicroVMs bootar på <125ms med <5 MiB
   overhead                             
  - Isolering via seccomp-bpf (begränsat
   till ~40 syscalls), chroot,          
  namespaces                            
  - Preview-URLer via wildcard          
  subdomains: {project-id}.lovable.app →
   routas till rätt VM med fly-replay
  headers                               
                                       
  2. Supabase: OAuth + Management API   
                                        
  Varje användare får sin egen          
  Supabase-instans (separat PostgreSQL, 
  Auth, Storage, Edge Functions):       
                                       
  1. Användaren klickar "Connect        
  Supabase" → OAuth 2.0 PKCE-flow mot 
  api.supabase.com                      
  2. Lovable får tokens till Supabase  
  Management API                        
  3. Kan skapa nya projekt (POST      
  /v1/projects), hämta API-nycklar, läsa
   schema                              
  4. Edge Functions deployas genom att  
  köra supabase CLI programmatiskt bakom
   kulisserna
                                        
  Alltså — Lovable äger inte            
  Supabase-projekten, användaren gör det
   via sitt eget Supabase-konto.        
                                       
  3. Övrig infrastruktur                
                                      
  Cloudflare (DDoS/CDN)                 
      ↓                                 
  GCP Private GKE Cluster               
  (Lovable-plattformen, AI-motorn)      
      ↓                                 
  Fly.io MicroVMs (per-projekt          
  dev-servrar, Vite+React+HMR)          
      ↓                                 
  Supabase Cloud (per-användare,        
  provisionerad via OAuth)              
                                        
  - Plattformen: GCP med privata        
  GKE-kluster, inga publika endpoints  
  - Kryptering: AES-256 at rest, TLS 1.3
   in transit, mTLS mellan tjänster     
  - Secrets: AES-GCM per fält, Google
  Cloud KMS med workspace-scoped        
  nyckelringar                         
                                        
  4. Relevant sårbarhet (CVE-2025-48757)
  
  Infrastrukturen var säker, men AI:n   
  genererade kod utan Row Level Security
   (RLS) på Supabase-tabeller. anon_key 
  i klient-koden kunde användas för att
  direkt querying:a databasen. 170+
  projekt exponerades. Lärdom: isolation
   mellan projekt fungerade, men
  säkerheten inom genererad kod var
  bristfällig.

  Relevans för KEYHOLDER                
  
  Om du vill bygga liknande:            
  - Fly.io Machines API med pre-poolade
  VMs ger bra isolation utan            
  container-overhead                   
  - Supabase Management API             
  (/v1/projects, /v1/oauth/authorize)  
  låter dig provisionera per-användare  
  - Alternativt: Supabase har ett     
  "Platforms"-program specifikt för     
  detta use case →                      
  supabase.com/docs/guides/integrations/
  supabase-for-platforms                
                                       
  Vill du att jag gräver djupare i någon
   specifik del?                        
  