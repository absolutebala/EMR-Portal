-- Complete the hierarchy: Head of Service now also requires a reporting manager
-- (Super Admin), same mechanism as Field Engineer -> Service Manager and
-- Service Manager -> Head of Service.
update public.roles set requires_manager = true where name = 'Head of Service';
