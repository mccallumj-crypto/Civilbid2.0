-- CivilBid private Storage policies for bucket: job-attachments
-- Path format: company_id/project_id/daily_report_id/uuid.ext

-- SELECT: assigned project users may read files.
create policy "CivilBid users can read assigned project files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'job-attachments'
  and public.is_company_member(((storage.foldername(name))[1])::uuid)
  and public.can_access_project(((storage.foldername(name))[2])::uuid)
);

-- INSERT: project users may upload only while the referenced report is editable,
-- or a manager may upload to the project.
create policy "CivilBid users can upload report files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'job-attachments'
  and public.is_company_member(((storage.foldername(name))[1])::uuid)
  and public.can_access_project(((storage.foldername(name))[2])::uuid)
  and (
    public.can_edit_report(((storage.foldername(name))[3])::uuid)
    or public.can_manage_project(((storage.foldername(name))[2])::uuid)
  )
);

-- DELETE: the original uploader or a project manager/admin may remove files.
create policy "CivilBid uploaders or managers can delete files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'job-attachments'
  and public.can_access_project(((storage.foldername(name))[2])::uuid)
  and (
    owner_id = (select auth.uid())::text
    or public.can_manage_project(((storage.foldername(name))[2])::uuid)
  )
);
