'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const loginSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  rememberMe: z.boolean().optional(),
});

export function LoginForm() {
  const router = useRouter();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    await authClient.signIn.email(
      {
        email: values.email,
        password: values.password,
        rememberMe: values.rememberMe,
        callbackURL: '/',
      },
      {
        onSuccess: () => {
          toast.success('Login successful!', { position: 'top-center' });
          router.push('/');
        },
        onError: (ctx) => {
          toast.error(ctx.error.message || 'Failed to login', {
            position: 'top-center',
          });
        },
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input type='email' placeholder='Enter your email' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  type='password'
                  placeholder='Enter your password'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='rememberMe'
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className='flex items-center gap-3'>
                  <Checkbox
                    id='rememberMe'
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor='rememberMe'>Remember me</Label>
                </div>
              </FormControl>
            </FormItem>
          )}
        />

        <Button type='submit' size='lg' className='w-full'>
          Login
        </Button>
      </form>
    </Form>
  );
}
