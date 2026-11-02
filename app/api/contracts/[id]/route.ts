import { idSchema } from '@/lib/domain';
import { route } from '@/lib/http';
import { getContract } from '@/lib/store';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>(async (_request, _role, { params }) => {
  const id = idSchema.parse((await params).id);
  return Response.json(await getContract(id));
});
