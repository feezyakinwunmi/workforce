-- Move the database's scheduled jobs off the old Vercel address (26 Nov 2026).
--
-- Three background functions wake the website up when there is work waiting:
--   private.request_push_dispatch()   -> /api/push/dispatch      (phone/browser pop-ups)
--   private.book_housekeeping()       -> /api/book/mail          (Book confirmation/reminder emails)
--   private.request_notes_dispatch()  -> /api/meet/notes/process (Meet AI notes)
-- They used https://phantomire-workforce.vercel.app. Femi retired every vercel.app address so the
-- product only lives on workbasecore.com, so each function is rebuilt from its current definition
-- with the address swapped for https://app.workbasecore.com. Nothing else in the functions changes.

do $$
declare
  f text;
  def text;
begin
  foreach f in array array[
    'private.request_push_dispatch()',
    'private.book_housekeeping()',
    'private.request_notes_dispatch()'
  ] loop
    def := pg_get_functiondef(f::regprocedure);
    execute replace(def, 'https://phantomire-workforce.vercel.app', 'https://app.workbasecore.com');
  end loop;
end $$;
