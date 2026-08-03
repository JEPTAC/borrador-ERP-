# Rotación obligatoria de credenciales

Las claves administrativas compartidas en mensajes deben considerarse comprometidas.

1. Firebase Console → Project settings → Service accounts: elimine la clave privada expuesta y genere una nueva.
2. Supabase → Settings → API Keys: revoque/rote secret y service_role expuestas.
3. Supabase → Database settings: cambie la contraseña si también fue compartida.
4. Guarde las nuevas credenciales solamente en `.env` local o GitHub Actions Secrets.
5. No coloque ninguna clave administrativa en el frontend del ERP.
