import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { 
  useGetSettings, 
  useUpdateSettings,
  getGetSettingsQueryKey
} from "@workspace/api-client-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage,
  FormDescription
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings as SettingsIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const settingsSchema = z.object({
  currency: z.string().min(1).max(3),
  cardFeePercent: z.coerce.number().min(0).max(100),
  defaultWorkerPercent: z.coerce.number().min(0).max(100),
  defaultWorkshopPercent: z.coerce.number().min(0).max(100),
});

export default function Settings() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() }
  });

  const updateSettings = useUpdateSettings();

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      currency: "USD",
      cardFeePercent: 15,
      defaultWorkerPercent: 50,
      defaultWorkshopPercent: 50,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        currency: settings.currency,
        cardFeePercent: settings.cardFeePercent,
        defaultWorkerPercent: settings.defaultWorkerPercent,
        defaultWorkshopPercent: settings.defaultWorkshopPercent,
      });
    }
  }, [settings, form]);

  const onSubmit = (data: z.infer<typeof settingsSchema>) => {
    updateSettings.mutate({ data }, {
      onSuccess: () => {
        toast({ title: t("settings.saved") });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: () => {
        toast({ title: t("settings.failed"), variant: "destructive" });
      }
    });
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("settings.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("settings.subtitle")}</p>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-primary" />
            {t("settings.globalPreferences")}
          </CardTitle>
          <CardDescription>
            {t("settings.globalDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.currency")}</FormLabel>
                        <FormControl>
                          <Input placeholder="USD" {...field} />
                        </FormControl>
                        <FormDescription>USD, EUR, £, $</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cardFeePercent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.cardFeePercent")}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultWorkerPercent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.defaultWorkerPercent")}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultWorkshopPercent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.defaultWorkshopPercent")}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end pt-4 border-t border-border">
                  <Button type="submit" disabled={updateSettings.isPending}>
                    {updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                    {updateSettings.isPending ? t("settings.saving") : t("settings.save")}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
